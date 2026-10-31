import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { billPeriods, bills, orders } from "~/server/db/schema";
import { runGetraenkeBilling } from "~/server/lib/billing-run";
import { sendTenantMail } from "~/server/lib/mailer";
import { buildUserBillData, summaryTotal } from "~/server/lib/user-bill-data";
import { billPdf, periodCsv } from "~/server/modules/billing/service";
import {
	billsOf,
	createBillPeriodRow,
	createBillRow,
	createOrderRow,
	eventUser,
	itemsOf,
	pdfValueAfter,
	setUpGetraenkeBilling,
	setUserPreference,
} from "../../../../test/factories/billing";
import {
	createDrink,
	createTenant,
	createUser,
	setKasseConfig,
	setupTestDatabases,
	signInAs,
	signOut,
	type TestUser,
	tenantDb,
	testScope,
} from "../../../../test/harness";
import { getOpenMemberBills } from "../getraenkewart/kasse";
import { createOrder } from "../orders";
import { getUserBillingData } from "../profile/getUserBill";
import {
	createNewBilling,
	getAllBillPeriods,
	getBillsForPeriod,
	updateBillStatus,
} from "./billings";

vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));
// Achievements run fire-and-forget after an order; they have their own tests.
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));

setupTestDatabases();

const mail = vi.mocked(sendTenantMail);

type Bill = typeof bills.$inferSelect;

// A Wednesday in ISO week 43/2026, at noon so the date is the same in
// Europe/Berlin and UTC.
const WEEK_43 = "2026-10-21T12:00:00Z";
const WEEK_44 = "2026-10-28T12:00:00Z";
const WEEK_45 = "2026-11-04T12:00:00Z";

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(WEEK_43));
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function setupKasse(features: Parameters<typeof createTenant>[0] = {}) {
	await createTenant(features);
	await setUpGetraenkeBilling();
	const wart = await createUser({ name: "Wart", roles: ["Getränkewart"] });
	signInAs(wart);
	return wart;
}

type BillingRun = Extract<
	Awaited<ReturnType<typeof runGetraenkeBilling>>,
	{ billPeriod: { id: string } }
>;

/** Runs the Kasse's billing, expected to create a period. */
async function runBilling(): Promise<BillingRun> {
	const result = await createNewBilling();
	if (!result.ok || !("billPeriod" in result.data)) {
		throw new Error(
			`Billing created no period: ${result.ok ? result.data.message : result.error}`,
		);
	}
	return result.data;
}

/**
 * A billing run that charges an inventory loss as Umlage, the way
 * "Inventur + Rechnung" starts it after closing an inventory.
 */
async function billWithLoss(inventoryLoss: number): Promise<BillingRun> {
	const result = await runGetraenkeBilling({ inventoryLoss });
	if (!("billPeriod" in result) || !result.billPeriod) {
		throw new Error(`Billing created no period: ${result.message}`);
	}
	return result;
}

async function billAt(iso: string) {
	vi.setSystemTime(new Date(iso));
	return runBilling();
}

async function periodByNumber(billNumber: string) {
	const [period] = await tenantDb()
		.select()
		.from(billPeriods)
		.where(eq(billPeriods.billNumber, billNumber));
	return period;
}

describe("createNewBilling", () => {
	test("refuses without the tenant's sender and account, creating nothing (#9)", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Getränkewart"] }));
		await createOrderRow({ user: await createUser() });

		const result = await createNewBilling();

		expect(result).toMatchObject({ ok: false, code: "BILLING_FAILED" });
		expect(!result.ok && result.error).toMatch(
			/^Bitte Absender und Konto in der Kasse hinterlegen \(fehlt: Absender, .*Getränkekasse-Konto mit gültiger IBAN\)\.$/,
		);
		expect(await tenantDb().select().from(billPeriods)).toHaveLength(0);
		expect(await tenantDb().select().from(bills)).toHaveLength(0);
		expect(mail).not.toHaveBeenCalled();
	});

	test("throws for anonymous callers and writes nothing", async () => {
		await createTenant();
		const member = await createUser();
		await createOrderRow({ user: member });
		signOut();

		expect(await createNewBilling()).toEqual({
			ok: false,
			error: "Nicht angemeldet",
			code: "UNAUTHENTICATED",
		});
		expect(await tenantDb().select().from(billPeriods)).toHaveLength(0);
	});

	test("does nothing when there are no unbilled orders", async () => {
		await setupKasse();
		const member = await createUser();
		await createOrderRow({ user: member, inBill: true });

		const result = await createNewBilling();

		expect(result).toMatchObject({ ok: true, data: { billsCreated: 0 } });
		expect(await tenantDb().select().from(billPeriods)).toHaveLength(0);
		expect(await tenantDb().select().from(bills)).toHaveLength(0);
		expect(mail).not.toHaveBeenCalled();
	});

	test("bills each member's unbilled orders and consolidates items per drink and price", async () => {
		await setupKasse();
		const max = await createUser({ name: "Max" });
		const moritz = await createUser({ name: "Moritz" });
		const pils = await createDrink({ name: "Pils", price: 1.5 });
		const wasser = await createDrink({ name: "Wasser", price: 1 });

		await createOrderRow({ user: max, drink: pils, amount: 2 });
		await createOrderRow({ user: max, drink: pils, amount: 1 });
		// Same drink after a price change stays a separate line.
		await createOrderRow({ user: max, drink: pils, pricePerUnit: 2 });
		await createOrderRow({ user: max, drink: wasser, amount: 3 });
		await createOrderRow({ user: moritz, drink: wasser, amount: 1 });
		await createOrderRow({
			user: moritz,
			drink: pils,
			amount: 10,
			inBill: true,
		});

		const result = await runBilling();

		expect(result).toMatchObject({
			success: true,
			billsCreated: 2,
			eventBillsCreated: 0,
			totalAmount: 10.5,
			billPeriod: { billNumber: "KW-43-26" },
		});
		const period = await periodByNumber("KW-43-26");
		expect(period).toMatchObject({ totalAmount: 10.5, closedAt: null });

		const [maxBill] = await billsOf(max.id);
		expect(maxBill).toMatchObject({
			billPeriodId: period?.id,
			userName: "Max",
			status: "Unbezahlt",
			drinksTotal: 9.5,
			oldBillingAmount: 0,
			fees: 0,
			umlage: 0,
			total: 9.5,
		});
		const items = await itemsOf(maxBill?.id ?? "");
		expect(
			items.map((i) => [
				i.drinkName,
				i.amount,
				i.pricePerDrink,
				i.totalPricePerDrink,
			]),
		).toEqual(
			expect.arrayContaining([
				["Pils", 3, 1.5, 4.5],
				["Pils", 1, 2, 2],
				["Wasser", 3, 1, 3],
			]),
		);
		expect(items).toHaveLength(3);

		const [moritzBill] = await billsOf(moritz.id);
		expect(moritzBill?.total).toBe(1);

		const remaining = await tenantDb()
			.select()
			.from(orders)
			.where(eq(orders.inBill, false));
		expect(remaining).toHaveLength(0);
	});

	test("bills orders placed through createOrder at the price that was booked", async () => {
		await setupKasse({ features: ["drinks.markup"] });
		await setKasseConfig({ markupPercent: 10 });
		const member = await createUser({ name: "Max" });
		const drink = await createDrink({ name: "Pils", price: 2 });
		signInAs(member);
		const order = { drinkName: "", pricePerUnit: 0, total: 0 };
		await createOrder({
			...order,
			drinkId: drink.id,
			amount: 3,
			bookingFor: null,
		});
		await createOrder({
			...order,
			drinkId: drink.id,
			amount: 1,
			bookingFor: "CC",
		});
		// A later markup change must not reprice orders already placed.
		await setKasseConfig({ markupPercent: 50 });
		signInAs(await createUser({ roles: ["Getränkewart"] }));

		const result = await createNewBilling();

		expect(result).toMatchObject({
			ok: true,
			data: { billsCreated: 1, eventBillsCreated: 1 },
		});
		const [bill] = await billsOf(member.id);
		expect(bill?.total).toBeCloseTo(6.6, 10);
		expect(await itemsOf(bill?.id ?? "")).toMatchObject([
			{ drinkName: "Pils", amount: 3, pricePerDrink: 2.2 },
		]);
		// Group orders carry no markup.
		expect((await billsOf("event-cc"))[0]?.total).toBe(2);
	});

	test("numbers runs KW-WW-YY, suffixes repeats within a week and closes the previous period", async () => {
		await setupKasse();
		const member = await createUser();

		await createOrderRow({ user: member });
		const first = await billAt(WEEK_43);
		await createOrderRow({ user: member });
		const second = await billAt("2026-10-22T12:00:00Z");
		await createOrderRow({ user: member });
		const third = await billAt("2026-10-23T12:00:00Z");
		await createOrderRow({ user: member });
		const nextWeek = await billAt(WEEK_44);

		expect(
			[first, second, third, nextWeek].map((r) => r.billPeriod?.billNumber),
		).toEqual(["KW-43-26", "KW-43-26-2", "KW-43-26-3", "KW-44-26"]);

		const periods = await getAllBillPeriods();
		expect(periods.map((p) => p.billNumber)).toEqual([
			"KW-44-26",
			"KW-43-26-3",
			"KW-43-26-2",
			"KW-43-26",
		]);
		expect(periods[0]?.closedAt).toBeNull();
		expect(periods[1]?.closedAt).toEqual(new Date(WEEK_44));
		expect((await getAllBillPeriods())[0]?.billNumber).toBe("KW-44-26");
	});

	test("carries unpaid bills over with a 10% fee above 5 € and marks them Übertragen", async () => {
		await setupKasse();
		const big = await createUser({ name: "Big" });
		const small = await createUser({ name: "Small" });
		const edge = await createUser({ name: "Edge" });
		const drink = await createDrink({ price: 20 });
		const cheap = await createDrink({ price: 4 });
		const five = await createDrink({ price: 5 });

		await createOrderRow({ user: big, drink });
		await createOrderRow({ user: small, drink: cheap });
		await createOrderRow({ user: edge, drink: five });
		await billAt(WEEK_43);

		const beer = await createDrink({ price: 1 });
		for (const user of [big, small, edge]) {
			await createOrderRow({ user, drink: beer });
		}
		const result = await billAt(WEEK_44);

		expect(result.totalAmount).toBe(34);
		const [oldBig, newBig] = await billsOf(big.id);
		expect(oldBig?.status).toBe("Übertragen");
		expect(newBig).toMatchObject({
			status: "Unbezahlt",
			drinksTotal: 1,
			oldBillingAmount: 20,
			fees: 2,
			total: 23,
		});
		const [oldSmall, newSmall] = await billsOf(small.id);
		expect(oldSmall?.status).toBe("Übertragen");
		expect(newSmall).toMatchObject({ oldBillingAmount: 4, fees: 0, total: 5 });
		// Exactly 5 € is not "over 5 €".
		const [, newEdge] = await billsOf(edge.id);
		expect(newEdge).toMatchObject({ oldBillingAmount: 5, fees: 0, total: 6 });
	});

	test("carries Gestundet bills without a fee", async () => {
		await setupKasse();
		const member = await createUser();
		const old = await createBillPeriodRow({ billNumber: "KW-40-26" });
		const deferred = await createBillRow({
			periodId: old.id,
			user: member,
			status: "Gestundet",
			drinksTotal: 20,
		});
		await createOrderRow({
			user: member,
			drink: await createDrink({ price: 2 }),
		});

		await createNewBilling();

		const rows = await billsOf(member.id);
		expect(rows.find((b) => b.id === deferred.id)?.status).toBe("Übertragen");
		expect(rows.find((b) => b.id !== deferred.id)).toMatchObject({
			oldBillingAmount: 20,
			fees: 0,
			total: 22,
		});
	});

	test("sums debt from several older periods and moves it into a carry-over-only bill", async () => {
		await setupKasse();
		const debtor = await createUser({ name: "Debtor" });
		const other = await createUser();
		// Two outstanding bills from different periods (e.g. the member was
		// skipped by an intermediate run).
		const p1 = await createBillPeriodRow({ billNumber: "KW-38-26" });
		const p2 = await createBillPeriodRow({ billNumber: "KW-40-26" });
		await createBillRow({ periodId: p1.id, user: debtor, drinksTotal: 3 });
		await createBillRow({ periodId: p2.id, user: debtor, drinksTotal: 5 });
		await createOrderRow({ user: other });

		const result = await runBilling();

		expect(result.billsCreated).toBe(2);
		const rows = await billsOf(debtor.id);
		expect(rows.filter((b) => b.status === "Übertragen")).toHaveLength(2);
		const carry = rows.find((b) => b.billPeriodId === result.billPeriod?.id);
		expect(carry).toMatchObject({
			userName: "Debtor",
			status: "Unbezahlt",
			drinksTotal: 0,
			umlage: 0,
			oldBillingAmount: 8,
		});
		expect(carry?.fees).toBeCloseTo(0.8, 10);
		expect(carry?.total).toBeCloseTo(8.8, 10);
		expect(await itemsOf(carry?.id ?? "")).toHaveLength(0);
		expect(result.userSummaries).toContainEqual(
			expect.objectContaining({
				userId: debtor.id,
				orders: [],
				drinksTotal: 0,
			}),
		);
	});

	test("never carries Bezahlt or Übertragen bills again", async () => {
		await setupKasse();
		const member = await createUser();
		const old = await createBillPeriodRow();
		await createBillRow({
			periodId: old.id,
			user: member,
			status: "Bezahlt",
			drinksTotal: 10,
		});
		await createBillRow({
			periodId: old.id,
			user: member,
			status: "Übertragen",
			drinksTotal: 10,
		});
		await createOrderRow({
			user: member,
			drink: await createDrink({ price: 1 }),
		});

		const result = await runBilling();

		const newBill = (await billsOf(member.id)).find(
			(b) => b.billPeriodId === result.billPeriod?.id,
		);
		expect(newBill).toMatchObject({ oldBillingAmount: 0, fees: 0, total: 1 });
	});

	test("bills group orders (bookingFor) once per group, without fees or carry-over", async () => {
		await setupKasse();
		const a = await createUser({ name: "A" });
		const b = await createUser({ name: "B" });
		const pils = await createDrink({ name: "Pils", price: 1.5 });
		const old = await createBillPeriodRow();
		const oldGroupBill = await createBillRow({
			periodId: old.id,
			user: eventUser("CC"),
			drinksTotal: 50,
		});

		await createOrderRow({ user: a, drink: pils, amount: 2, bookingFor: "CC" });
		await createOrderRow({ user: b, drink: pils, amount: 4, bookingFor: "CC" });
		await createOrderRow({
			user: b,
			drink: pils,
			amount: 1,
			bookingFor: "AHV Stammtisch",
		});

		const result = await createNewBilling();

		expect(result).toMatchObject({
			ok: true,
			data: { billsCreated: 0, eventBillsCreated: 2, totalAmount: 10.5 },
		});
		// Members who only booked for groups get no personal bill.
		expect(await billsOf(a.id)).toHaveLength(0);
		expect(await billsOf(b.id)).toHaveLength(0);

		const cc = (await billsOf("event-cc")).find(
			(bill) => bill.id !== oldGroupBill.id,
		);
		expect(cc).toMatchObject({
			userName: "CC",
			oldBillingAmount: 0,
			fees: 0,
			drinksTotal: 9,
			total: 9,
		});
		expect(await itemsOf(cc?.id ?? "")).toMatchObject([
			{ drinkName: "Pils", amount: 6, totalPricePerDrink: 9 },
		]);
		expect((await billsOf("event-ahv-stammtisch"))[0]).toMatchObject({
			userName: "AHV Stammtisch",
			total: 1.5,
		});
		// Open group bills are settled directly and stay untouched.
		expect(
			(await billsOf("event-cc")).find((bill) => bill.id === oldGroupBill.id)
				?.status,
		).toBe("Unbezahlt");
	});

	test("adds the Umlage share (loss / Hausbewohner) to the bills of residents", async () => {
		await setupKasse();
		const residents = [
			await createUser({ roles: ["Hausbewohner"] }),
			await createUser({ roles: ["Hausbewohner"] }),
			await createUser({ roles: ["Hausbewohner"] }),
		];
		const drink = await createDrink({ price: 2 });
		for (const user of residents) {
			await createOrderRow({ user, drink });
		}

		const result = await billWithLoss(30);

		expect(result.totalAmount).toBe(36);
		for (const user of residents) {
			expect((await billsOf(user.id))[0]).toMatchObject({
				drinksTotal: 2,
				umlage: 10,
				total: 12,
			});
		}
	});

	test("the lines a bill prints add up to its total (#11)", async () => {
		await setupKasse();
		const resident = await createUser({ roles: ["Hausbewohner"] });
		const other = await createUser({ roles: ["Hausbewohner"] });
		const old = await createBillPeriodRow({ createdAt: new Date(WEEK_43) });
		await createBillRow({ periodId: old.id, user: resident, total: 12.35 });
		const drink = await createDrink({ price: 1.7 });
		await createOrderRow({ user: resident, drink, amount: 3 });
		await createOrderRow({ user: other, drink });
		await createOrderRow({ user: other, drink, bookingFor: "AHV" });

		const run = await billWithLoss(10.01);

		const periodBills = await tenantDb()
			.select()
			.from(bills)
			.where(eq(bills.billPeriodId, run.billPeriod.id));
		expect(periodBills).toHaveLength(3);
		for (const bill of periodBills) {
			const data = buildUserBillData(
				bill,
				{ ...run.billPeriod, createdAt: new Date() },
				[],
			);
			expect(summaryTotal(data)).toBe(bill.total);
		}
		const residentBill = periodBills.find((b) => b.userId === resident.id);
		expect(residentBill).toMatchObject({ fees: 1.24, oldBillingAmount: 12.35 });
		expect(residentBill?.umlage).toBeGreaterThan(0);
	});

	// #10: the Umlage goes to the Hausbewohner it was divided among, not to
	// every member with orders.
	test("charges the Umlage to exactly the Hausbewohner (#10)", async () => {
		await setupKasse();
		const residentWithOrders = await createUser({ roles: ["Hausbewohner"] });
		const residentWithout = await createUser({ roles: ["Hausbewohner"] });
		const nonResident = await createUser();
		const drink = await createDrink({ price: 2 });
		await createOrderRow({ user: residentWithOrders, drink });
		await createOrderRow({ user: nonResident, drink });

		await billWithLoss(20);

		expect((await billsOf(nonResident.id))[0]?.umlage).toBe(0);
		expect((await billsOf(residentWithOrders.id))[0]?.umlage).toBe(10);
		expect((await billsOf(residentWithout.id))[0]?.umlage).toBe(10);
	});

	// #10: with no Hausbewohner nobody carries the loss (the divisor used to
	// fall back to 1, charging every billed member the whole loss).
	test("never collects more Umlage than the inventory loss (#10)", async () => {
		await setupKasse();
		const drink = await createDrink({ price: 1 });
		await createOrderRow({ user: await createUser(), drink });
		await createOrderRow({ user: await createUser(), drink });

		await billWithLoss(30);

		const rows = await tenantDb().select().from(bills);
		const collected = rows.reduce((sum, b) => sum + b.umlage, 0);
		expect(collected).toBeLessThanOrEqual(30);
	});

	// #13: fees (and therefore totals) must not carry sub-cent fractions.
	test("rounds fees and totals to whole cents (#13)", async () => {
		await setupKasse();
		const member = await createUser();
		const old = await createBillPeriodRow();
		await createBillRow({ periodId: old.id, user: member, drinksTotal: 7.77 });
		await createOrderRow({
			user: member,
			drink: await createDrink({ price: 1.5 }),
		});

		const result = await runBilling();

		const bill = (await billsOf(member.id)).find(
			(b) => b.billPeriodId === result.billPeriod?.id,
		);
		expect(bill?.fees).toBe(0.78);
		expect(bill?.total).toBe(10.05);
	});

	// #13: the bill lines (Übertrag, Gebühren, Umlage, Getränke) printed with
	// two decimals must add up to the stored total, for awkward inputs too.
	test("stores whole-cent parts whose sum is the total (#13)", async () => {
		await setupKasse();
		const isWholeCents = (n: number) => n === Math.round(n * 100) / 100;
		const cases = [
			{ old: 5.05, price: 1.1, amount: 3 },
			{ old: 13.37, price: 0.7, amount: 7 },
			{ old: 29.99, price: 1.15, amount: 1 },
			{ old: 0.1 + 0.2, price: 2.35, amount: 3 },
		];
		const members: Array<{ id: string; name: string | null }> = [];
		const old = await createBillPeriodRow();
		for (const [i, c] of cases.entries()) {
			// Three Hausbewohner share the loss; the last member is not one.
			const member = await createUser({
				roles: i < 3 ? ["Hausbewohner"] : [],
			});
			members.push(member);
			await createBillRow({
				periodId: old.id,
				user: member,
				drinksTotal: c.old,
			});
			await createOrderRow({
				user: member,
				drink: await createDrink({ price: c.price }),
				amount: c.amount,
			});
		}

		// 10 € loss over 3 Hausbewohner: 3.333… € is stored as 3.33 €.
		const result = await billWithLoss(10);

		let periodCents = 0;
		for (const member of members) {
			const bill = (await billsOf(member.id)).find(
				(b) => b.billPeriodId === result.billPeriod.id,
			);
			if (!bill) {
				throw new Error("missing bill");
			}
			const parts = [
				bill.drinksTotal,
				bill.oldBillingAmount,
				bill.fees,
				bill.umlage,
			];
			for (const part of [...parts, bill.total]) {
				expect(isWholeCents(part)).toBe(true);
			}
			const partCents = parts.reduce((s, p) => s + Math.round(p * 100), 0);
			expect(Math.round(bill.total * 100)).toBe(partCents);
			expect(bill.total).toBe(partCents / 100);
			periodCents += partCents;
		}
		const [first] = await billsOf(members[0]?.id ?? "");
		expect(first?.status).toBe("Übertragen");
		// Old balance 5.05 € → 10 % fee of 0.505 € is charged as 0.51 €.
		const firstNew = (await billsOf(members[0]?.id ?? "")).at(-1);
		expect(firstNew).toMatchObject({ oldBillingAmount: 5.05, fees: 0.51 });
		expect(firstNew?.umlage).toBe(3.33);
		const period = await periodByNumber(result.billPeriod.billNumber);
		expect(period?.totalAmount).toBe(periodCents / 100);
	});

	test("uses the ISO week-year at the turn of the year (#15)", async () => {
		await setupKasse();
		await createOrderRow({ user: await createUser() });

		// Friday 1 Jan 2027 belongs to ISO week 53 of 2026.
		const result = await billAt("2027-01-01T12:00:00Z");

		expect(result.billPeriod?.billNumber).toBe("KW-53-26");
	});

	// CI runs this file under TZ=Europe/Berlin and TZ=UTC.
	test("numbers the week in German time, not server time (#15)", async () => {
		await setupKasse();
		await createOrderRow({ user: await createUser() });

		// Sunday 23:30 UTC is already Monday of week 44 in Germany.
		const result = await billAt("2026-10-25T23:30:00Z");

		expect(result.billPeriod?.billNumber).toBe("KW-44-26");
	});
});

// #10 (owner's decision): the inventory loss is carried by every active
// Hausbewohner, split evenly by headcount in whole cents. Hausbewohner
// without orders get an Umlage-only bill; nobody else pays Umlage. The
// rounding remainder is not charged (the Kasse absorbs it).
describe("Umlage (#10)", () => {
	async function hausbewohner(
		n: number,
		opts: Parameters<typeof createUser>[0] = {},
	) {
		const created: TestUser[] = [];
		for (let i = 0; i < n; i++) {
			created.push(await createUser({ roles: ["Hausbewohner"], ...opts }));
		}
		return created;
	}

	async function periodBills(periodId: string) {
		return tenantDb()
			.select()
			.from(bills)
			.where(eq(bills.billPeriodId, periodId));
	}

	const umlageSum = (rows: Array<{ umlage: number }>) =>
		rows.reduce((cents, b) => cents + Math.round(b.umlage * 100), 0) / 100;

	test("120 € over 6 Hausbewohner among 30 members who ordered: only the 6 pay, 20 € each", async () => {
		await setupKasse();
		const residents = await hausbewohner(6);
		const others: TestUser[] = [];
		for (let i = 0; i < 24; i++) {
			others.push(await createUser());
		}
		const drink = await createDrink({ price: 1 });
		for (const user of [...residents, ...others]) {
			await createOrderRow({ user, drink });
		}

		const run = await billWithLoss(120);

		const rows = await periodBills(run.billPeriod.id);
		expect(rows).toHaveLength(30);
		for (const user of residents) {
			expect((await billsOf(user.id))[0]).toMatchObject({
				drinksTotal: 1,
				umlage: 20,
				total: 21,
			});
		}
		for (const user of others) {
			expect((await billsOf(user.id))[0]).toMatchObject({
				umlage: 0,
				total: 1,
			});
		}
		expect(umlageSum(rows)).toBe(120);
		expect(run.totalAmount).toBe(150);
	});

	test("a Hausbewohner without orders gets an Umlage-only bill", async () => {
		await setupKasse();
		const [resident] = await hausbewohner(1, { name: "Hanna Haus" });
		const [drinker] = await hausbewohner(1);
		await createOrderRow({
			user: drinker as TestUser,
			drink: await createDrink({ price: 2 }),
		});

		const run = await billWithLoss(30);

		expect(run.billsCreated).toBe(2);
		const [bill] = await billsOf(resident?.id ?? "");
		expect(bill).toMatchObject({
			billPeriodId: run.billPeriod.id,
			userName: "Hanna Haus",
			status: "Unbezahlt",
			drinksTotal: 0,
			oldBillingAmount: 0,
			fees: 0,
			umlage: 15,
			total: 15,
		});
		expect(await itemsOf(bill?.id ?? "")).toEqual([]);
		expect(run.userSummaries).toContainEqual(
			expect.objectContaining({
				userId: resident?.id,
				orders: [],
				umlage: 15,
				finalTotal: 15,
			}),
		);
		const period = await periodByNumber(run.billPeriod.billNumber);
		expect(period?.totalAmount).toBe(32);
	});

	test("an Umlage-only bill is mailed, printed, exported, listed and shown on the profile", async () => {
		await setupKasse();
		const [resident] = (await hausbewohner(1, {
			name: "Hanna",
			email: "hanna@example.test",
		})) as [TestUser];
		await createOrderRow({ user: await createUser() });

		const run = await billWithLoss(12.5);

		const [bill] = await billsOf(resident.id);
		if (!bill) {
			throw new Error("missing Umlage-only bill");
		}
		// Mail with the PDF, whose lines add up to the total.
		const hannaMail = mail.mock.calls.find(
			([m]) => m.to === "hanna@example.test",
		)?.[0];
		expect(hannaMail?.text).toContain("Gesamtbetrag: 12,50€");
		const pdf = (await billPdf(testScope(), bill.id)).pdf;
		expect(pdfValueAfter(pdf, "Umlage:")).toMatch(/^12,50/);
		expect(pdfValueAfter(pdf, "Gesamtbetrag:")).toMatch(/^12,50/);
		// CSV row of the period.
		const csv = await periodCsv(testScope(), run.billPeriod.id, {
			delimiter: ";",
		});
		const row = csv.csvContent
			?.split("\n")
			.find((line) => line.startsWith("Hanna;"));
		expect(row).toContain(
			"0,00 EUR;0,00 EUR;0,00 EUR;12,50 EUR;12,50 EUR;Hanna;",
		);
		// Kasse/Rechnungen dashboard.
		const listed = await getBillsForPeriod(run.billPeriod.id);
		expect(listed.find((b) => b.name === "Hanna")).toMatchObject({
			totalDue: 12.5,
			drinksTotal: 0,
			umlage: 12.5,
			items: [],
		});
		// The Kasse's open member bills.
		expect(await getOpenMemberBills()).toContainEqual(
			expect.objectContaining({ userName: "Hanna", total: 12.5 }),
		);
		// The member's profile.
		signInAs(resident);
		expect((await getUserBillingData()).billData).toMatchObject({
			total: 12.5,
			umlage: 12.5,
		});
	});

	test("an unpaid Umlage-only bill is carried into the next period with the late fee", async () => {
		await setupKasse();
		const [resident] = (await hausbewohner(1)) as [TestUser];
		await createOrderRow({ user: await createUser() });
		await billWithLoss(30);

		vi.setSystemTime(new Date(WEEK_44));
		await createOrderRow({ user: await createUser() });
		const next = await runBilling();

		const [first, second] = await billsOf(resident.id);
		expect(first).toMatchObject({ status: "Übertragen", umlage: 30 });
		expect(second).toMatchObject({
			billPeriodId: next.billPeriod.id,
			status: "Unbezahlt",
			oldBillingAmount: 30,
			fees: 3,
			umlage: 0,
			total: 33,
		});
	});

	test("a Hausbewohner with old debt but no orders gets one bill with both", async () => {
		await setupKasse();
		const [resident] = (await hausbewohner(1)) as [TestUser];
		const old = await createBillPeriodRow();
		await createBillRow({ periodId: old.id, user: resident, drinksTotal: 10 });
		await createOrderRow({ user: await createUser() });

		const run = await billWithLoss(20);

		const current = (await billsOf(resident.id)).filter(
			(b) => b.billPeriodId === run.billPeriod.id,
		);
		expect(current).toEqual([
			expect.objectContaining({
				oldBillingAmount: 10,
				fees: 1,
				umlage: 20,
				total: 31,
			}),
		]);
	});

	test("a member who ordered but is no Hausbewohner pays no Umlage", async () => {
		await setupKasse();
		await hausbewohner(2);
		const guest = await createUser({ roles: ["Alter Herr"] });
		await createOrderRow({
			user: guest,
			drink: await createDrink({ price: 1 }),
		});

		await billWithLoss(50);

		expect((await billsOf(guest.id))[0]).toMatchObject({
			umlage: 0,
			total: 1,
		});
	});

	test("rounds each share down to whole cents and leaves the remainder to the Kasse", async () => {
		await setupKasse();
		const residents = await hausbewohner(3);
		await createOrderRow({ user: await createUser() });

		const run = await billWithLoss(100);

		for (const user of residents) {
			expect((await billsOf(user.id))[0]).toMatchObject({
				umlage: 33.33,
				total: 33.33,
			});
		}
		expect(umlageSum(await periodBills(run.billPeriod.id))).toBe(99.99);
	});

	test("charges no Umlage and creates no Umlage-only bills for a zero or negative loss", async () => {
		await setupKasse();
		const [resident, drinker] = (await hausbewohner(2)) as [TestUser, TestUser];
		await createOrderRow({ user: drinker });

		const run = await billWithLoss(0);
		await createOrderRow({ user: drinker });
		vi.setSystemTime(new Date(WEEK_44));
		const second = await billWithLoss(-12);

		expect(await billsOf(resident.id)).toEqual([]);
		for (const r of [run, second]) {
			expect(umlageSum(await periodBills(r.billPeriod.id))).toBe(0);
		}
	});

	test("a loss smaller than one cent per Hausbewohner is not charged", async () => {
		await setupKasse();
		const [resident] = (await hausbewohner(3)) as [TestUser];
		await createOrderRow({ user: await createUser() });

		await billWithLoss(0.02);

		expect(await billsOf(resident.id)).toEqual([]);
	});

	test("without Hausbewohner nobody pays Umlage and the run still bills", async () => {
		await setupKasse();
		const member = await createUser();
		await createOrderRow({
			user: member,
			drink: await createDrink({ price: 2 }),
		});

		const run = await billWithLoss(40);

		expect(run).toMatchObject({ success: true, billsCreated: 1 });
		expect((await billsOf(member.id))[0]).toMatchObject({
			umlage: 0,
			total: 2,
		});
	});

	test("suspended and pending members are not counted and pay no Umlage", async () => {
		await setupKasse();
		const active = await hausbewohner(2);
		const [suspended] = (await hausbewohner(1, {
			membership: "suspended",
		})) as [TestUser];
		const [pending] = (await hausbewohner(1, { membership: "pending" })) as [
			TestUser,
		];
		const drink = await createDrink({ price: 1 });
		await createOrderRow({ user: suspended, drink });

		const run = await billWithLoss(30);

		for (const user of active) {
			expect((await billsOf(user.id))[0]?.umlage).toBe(15);
		}
		expect((await billsOf(suspended.id))[0]).toMatchObject({
			umlage: 0,
			total: 1,
		});
		expect(await billsOf(pending.id)).toEqual([]);
		expect(umlageSum(await periodBills(run.billPeriod.id))).toBe(30);
	});

	test("bills the Umlage even when nobody ordered anything", async () => {
		await setupKasse();
		const residents = await hausbewohner(2);

		const run = await billWithLoss(9);

		expect(run.billsCreated).toBe(2);
		for (const user of residents) {
			expect((await billsOf(user.id))[0]).toMatchObject({
				umlage: 4.5,
				total: 4.5,
			});
		}
	});

	test("the Kasse's plain billing run never charges a loss sent by the browser", async () => {
		await setupKasse();
		const [resident] = (await hausbewohner(1)) as [TestUser];
		await createOrderRow({ user: resident });

		// A crafted request could pass an argument to the server action.
		const forged = createNewBilling as (
			loss: unknown,
		) => ReturnType<typeof createNewBilling>;
		await forged(500);

		expect((await billsOf(resident.id))[0]?.umlage).toBe(0);
	});
});

describe("createNewBilling mails", () => {
	test("mails each member their own bill PDF, skipping opt-outs and group bills", async () => {
		await setupKasse();
		const max = await createUser({ name: "Max", email: "max@example.test" });
		const optedOut = await createUser({ email: "quiet@example.test" });
		const optedIn = await createUser({
			name: "Ina",
			email: "ina@example.test",
		});
		await setUserPreference(optedOut.id, "notifications.emailEnabled", "false");
		await setUserPreference(optedIn.id, "notifications.emailEnabled", "true");
		const drink = await createDrink({ price: 2 });
		await createOrderRow({ user: max, drink, amount: 2 });
		await createOrderRow({ user: optedOut, drink });
		await createOrderRow({ user: optedIn, drink });
		await createOrderRow({ user: max, drink, bookingFor: "CC" });

		await createNewBilling();

		expect(mail).toHaveBeenCalledTimes(2);
		expect(mail.mock.calls.map(([m]) => m.to).sort()).toEqual([
			"ina@example.test",
			"max@example.test",
		]);
		const maxMail = mail.mock.calls.find(
			([m]) => m.to === "max@example.test",
		)?.[0];
		expect(maxMail?.subject).toBe("Deine Getränkerechnung KW-43-26 ist bereit");
		expect(maxMail?.text).toContain("Gesamtbetrag: 4,00€");
		expect(maxMail?.attachments).toEqual([
			expect.objectContaining({
				filename: "Rechnung_KW-43-26_Max.pdf",
				contentType: "application/pdf",
			}),
		]);
		expect(maxMail?.attachments?.[0]?.content.subarray(0, 5).toString()).toBe(
			"%PDF-",
		);
	});

	test("sends every bill, including group bills, to the treasurer when configured", async () => {
		await setupKasse({ features: ["billing.treasurerRecipient"] });
		await setKasseConfig({
			billRecipient: "treasurer",
			treasurerEmail: " kassenwart@example.test ",
		});
		const max = await createUser({ name: "Max" });
		const anna = await createUser({ name: "Anna" });
		const drink = await createDrink({ price: 1 });
		await createOrderRow({ user: max, drink });
		await createOrderRow({ user: anna, drink });
		await createOrderRow({ user: anna, drink, bookingFor: "CC" });

		await createNewBilling();

		expect(mail).toHaveBeenCalledTimes(3);
		expect(
			mail.mock.calls.every(([m]) => m.to === "kassenwart@example.test"),
		).toBe(true);
		expect(mail.mock.calls.map(([m]) => m.subject)).toEqual([
			"Getränkerechnung KW-43-26: Anna",
			"Getränkerechnung KW-43-26: CC",
			"Getränkerechnung KW-43-26: Max",
		]);
	});

	test("ignores a saved treasurer address while the feature is off", async () => {
		await setupKasse();
		await setKasseConfig({
			billRecipient: "treasurer",
			treasurerEmail: "kassenwart@example.test",
		});
		const member = await createUser({ email: "member@example.test" });
		await createOrderRow({ user: member });

		await createNewBilling();

		expect(mail).toHaveBeenCalledTimes(1);
		expect(mail.mock.calls[0]?.[0].to).toBe("member@example.test");
	});

	test("a failing mail neither aborts the run nor the remaining mails", async () => {
		await setupKasse();
		const drink = await createDrink();
		await createOrderRow({ user: await createUser({ name: "A" }), drink });
		await createOrderRow({ user: await createUser({ name: "B" }), drink });
		mail.mockRejectedValueOnce(new Error("SMTP down"));

		const result = await createNewBilling();

		expect(result).toMatchObject({ ok: true, data: { billsCreated: 2 } });
		expect(mail).toHaveBeenCalledTimes(2);
		expect(await tenantDb().select().from(bills)).toHaveLength(2);
	});
});

describe("updateBillStatus", () => {
	test("paying the consolidated bill settles its Übertragen predecessors", async () => {
		await setupKasse();
		const member = await createUser();
		const bystander = await createUser();
		const drink = await createDrink({ price: 10 });

		await createOrderRow({ user: member, drink });
		await createOrderRow({ user: bystander, drink });
		await billAt(WEEK_43);
		await createOrderRow({ user: member, drink });
		await createOrderRow({ user: bystander, drink });
		await billAt(WEEK_44);
		await createOrderRow({ user: member, drink });
		await billAt(WEEK_45);

		const chain = await billsOf(member.id);
		expect(chain.map((b) => b.status)).toEqual([
			"Übertragen",
			"Übertragen",
			"Unbezahlt",
		]);
		// 10 → 10 + 10 + 1 → 21 + 10 + 2.1
		expect(chain[2]?.total).toBeCloseTo(33.1, 10);

		vi.setSystemTime(new Date("2026-11-05T09:00:00Z"));
		expect(await updateBillStatus(chain[2]?.id ?? "", "Bezahlt")).toEqual({
			ok: true,
		});

		const after = await billsOf(member.id);
		expect(after.map((b) => b.status)).toEqual([
			"Bezahlt",
			"Bezahlt",
			"Bezahlt",
		]);
		for (const bill of after) {
			expect(bill.paidAt).toEqual(new Date("2026-11-05T09:00:00Z"));
		}
		// Another member's chain (carried into a carry-over-only bill in week
		// 45) is not touched.
		expect((await billsOf(bystander.id)).map((b) => b.status)).toEqual([
			"Übertragen",
			"Übertragen",
			"Unbezahlt",
		]);
	});

	test("leaves later Übertragen bills alone and clears paidAt when unpaid again", async () => {
		await setupKasse();
		const member = await createUser();
		const p1 = await createBillPeriodRow();
		const p2 = await createBillPeriodRow();
		const older = await createBillRow({
			periodId: p1.id,
			user: member,
			drinksTotal: 5,
			createdAt: new Date("2026-10-01T12:00:00Z"),
		});
		const newer = await createBillRow({
			periodId: p2.id,
			user: member,
			status: "Übertragen",
			drinksTotal: 5,
			createdAt: new Date("2026-10-15T12:00:00Z"),
		});

		await updateBillStatus(older.id, "Bezahlt");
		const [paidOlder, untouched] = await billsOf(member.id);
		expect(paidOlder).toMatchObject({ status: "Bezahlt" });
		expect(paidOlder?.paidAt).toEqual(new Date(WEEK_43));
		expect(untouched).toMatchObject({ id: newer.id, status: "Übertragen" });

		await updateBillStatus(older.id, "Gestundet");
		const [deferred] = await billsOf(member.id);
		expect(deferred).toMatchObject({ status: "Gestundet", paidAt: null });
	});

	/** A member with P1 → P2 carried and P3 open, P1 and P2 "Übertragen". */
	async function carriedChain() {
		await setupKasse();
		const member = await createUser();
		const drink = await createDrink({ price: 10 });
		for (const week of [WEEK_43, WEEK_44, WEEK_45]) {
			await createOrderRow({ user: member, drink });
			await billAt(week);
		}
		const chain = await billsOf(member.id);
		expect(chain.map((b) => b.status)).toEqual([
			"Übertragen",
			"Übertragen",
			"Unbezahlt",
		]);
		return { member, chain: chain as [Bill, Bill, Bill] };
	}

	const PAID_THROUGH =
		"Diese Rechnung wurde mit der späteren Rechnung bezahlt, in die sie übertragen wurde. Ändere den Status dort.";

	test("refuses to reopen a bill that was paid through the later bill it was carried into (#183)", async () => {
		const { member, chain } = await carriedChain();
		const paidAt = new Date("2026-11-05T09:00:00Z");
		vi.setSystemTime(paidAt);
		await updateBillStatus(chain[2].id, "Bezahlt");

		for (const bill of chain.slice(0, 2)) {
			for (const status of ["Unbezahlt", "Gestundet", "Bezahlt"] as const) {
				expect(await updateBillStatus(bill.id, status)).toEqual({
					ok: false,
					error: PAID_THROUGH,
					code: "CARRIED_BILL",
				});
			}
		}

		expect((await billsOf(member.id)).map((b) => [b.status, b.paidAt])).toEqual(
			[
				["Bezahlt", paidAt],
				["Bezahlt", paidAt],
				["Bezahlt", paidAt],
			],
		);
	});

	test("refuses to pay an Übertragen bill on its own (#183)", async () => {
		const { member, chain } = await carriedChain();

		for (const status of ["Bezahlt", "Gestundet", "Unbezahlt"] as const) {
			expect(await updateBillStatus(chain[0].id, status)).toEqual({
				ok: false,
				error:
					"Diese Rechnung wurde in eine spätere Rechnung übertragen und wird dort bezahlt",
				code: "CARRIED_BILL",
			});
		}
		expect((await billsOf(member.id)).map((b) => b.status)).toEqual([
			"Übertragen",
			"Übertragen",
			"Unbezahlt",
		]);
	});

	test("marking the paid bill paid again keeps the bills it settled tied to it (#183)", async () => {
		const { member, chain } = await carriedChain();
		const paidAt = new Date("2026-11-05T09:00:00Z");
		vi.setSystemTime(paidAt);
		await updateBillStatus(chain[2].id, "Bezahlt");
		vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));

		expect(await updateBillStatus(chain[2].id, "Bezahlt")).toEqual({
			ok: true,
		});

		expect((await billsOf(member.id)).map((b) => b.paidAt)).toEqual([
			paidAt,
			paidAt,
			paidAt,
		]);
		expect(await updateBillStatus(chain[0].id, "Unbezahlt")).toEqual({
			ok: false,
			error: PAID_THROUGH,
			code: "CARRIED_BILL",
		});
	});

	test("refuses Übertragen as a new status and unknown bills", async () => {
		const { member, chain } = await carriedChain();

		expect(await updateBillStatus(chain[2].id, "Übertragen")).toEqual({
			ok: false,
			error: "Ungültiger Status",
			code: "INVALID_INPUT",
		});
		expect(await updateBillStatus("gibt-es-nicht", "Bezahlt")).toEqual({
			ok: false,
			error: "Rechnung nicht gefunden",
			code: "NOT_FOUND",
		});
		expect((await billsOf(member.id)).at(-1)?.status).toBe("Unbezahlt");
	});

	test("group bills are never carried: one paid in the same second as a later one stays changeable", async () => {
		await setupKasse();
		const group = eventUser("CC");
		const older = await createBillRow({
			periodId: (await createBillPeriodRow()).id,
			user: group,
			drinksTotal: 5,
			createdAt: new Date(WEEK_43),
		});
		const newer = await createBillRow({
			periodId: (await createBillPeriodRow()).id,
			user: group,
			drinksTotal: 7,
			createdAt: new Date(WEEK_44),
		});
		vi.setSystemTime(new Date(WEEK_45));
		await updateBillStatus(older.id, "Bezahlt");
		await updateBillStatus(newer.id, "Bezahlt");

		expect(await updateBillStatus(older.id, "Unbezahlt")).toEqual({ ok: true });
		expect((await billsOf(group.id)).map((b) => b.status)).toEqual([
			"Unbezahlt",
			"Bezahlt",
		]);

		// Nor does un-paying the later one reopen the earlier one.
		await updateBillStatus(older.id, "Bezahlt");
		await updateBillStatus(newer.id, "Unbezahlt");
		expect((await billsOf(group.id)).map((b) => b.status)).toEqual([
			"Bezahlt",
			"Unbezahlt",
		]);
	});

	test("undoing the payment of the newest bill reopens exactly the bills it settled (#182)", async () => {
		const { member, chain } = await carriedChain();
		// Paid on its own long before; not part of the chain.
		const earlier = await createBillRow({
			periodId: (await createBillPeriodRow()).id,
			user: member,
			status: "Bezahlt",
			drinksTotal: 4,
			createdAt: new Date("2026-10-01T12:00:00Z"),
			paidAt: new Date("2026-10-02T12:00:00Z"),
		});
		// Another member paid in the same second.
		const other = await createUser();
		const otherBill = await createBillRow({
			periodId: chain[0].billPeriodId,
			user: other,
			drinksTotal: 3,
			createdAt: new Date(WEEK_43),
		});
		const paidAt = new Date("2026-11-05T09:00:00Z");
		vi.setSystemTime(paidAt);
		await updateBillStatus(otherBill.id, "Bezahlt");
		await updateBillStatus(chain[2].id, "Bezahlt");

		expect(await updateBillStatus(chain[2].id, "Unbezahlt")).toEqual({
			ok: true,
		});

		expect(
			(await billsOf(member.id)).map((b) => [b.id, b.status, b.paidAt]),
		).toEqual([
			[earlier.id, "Bezahlt", new Date("2026-10-02T12:00:00Z")],
			[chain[0].id, "Übertragen", null],
			[chain[1].id, "Übertragen", null],
			[chain[2].id, "Unbezahlt", null],
		]);
		expect((await billsOf(other.id))[0]).toMatchObject({
			status: "Bezahlt",
			paidAt,
		});

		// Paying again and deferring instead reopens them the same way.
		vi.setSystemTime(new Date("2026-11-06T09:00:00Z"));
		await updateBillStatus(chain[2].id, "Bezahlt");
		await updateBillStatus(chain[2].id, "Gestundet");
		expect((await billsOf(member.id)).map((b) => b.status)).toEqual([
			"Bezahlt",
			"Übertragen",
			"Übertragen",
			"Gestundet",
		]);
	});
});

describe("billing overview reads", () => {
	test("getBillsForPeriod lists the period's bills by name with their items", async () => {
		await setupKasse();
		const period = await createBillPeriodRow();
		const other = await createBillPeriodRow();
		await createBillRow({
			periodId: period.id,
			user: { id: "u-z", name: "Zacharias" },
			drinksTotal: 3,
			oldBillingAmount: 20,
			fees: 2,
			items: [{ drinkName: "Pils", amount: 2, pricePerDrink: 1.5 }],
		});
		await createBillRow({
			periodId: period.id,
			user: { id: "u-a", name: "Anton" },
			status: "Bezahlt",
			drinksTotal: 1,
		});
		await createBillRow({ periodId: other.id, user: { id: "u-x", name: "X" } });

		const result = await getBillsForPeriod(period.id);

		expect(result.map((b) => b.name)).toEqual(["Anton", "Zacharias"]);
		expect(result[1]).toMatchObject({
			totalDue: 25,
			status: "Unbezahlt",
			oldBillingAmount: 20,
			drinksTotal: 3,
			fees: 2,
			items: [{ name: "Pils", quantity: 2, unitPrice: 1.5, subtotal: 3 }],
		});
	});
});
