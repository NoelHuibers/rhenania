import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { billPeriods, bills, orders } from "~/server/db/schema";
import { sendTenantMail } from "~/server/lib/mailer";
import {
	billsOf,
	createBillPeriodRow,
	createBillRow,
	createOrderRow,
	eventUser,
	itemsOf,
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
	tenantDb,
} from "../../../../test/harness";
import { createOrder } from "../orders";
import {
	closeBillPeriod,
	createNewBilling,
	getAllBillPeriods,
	getBillingStatistics,
	getBillsForPeriod,
	getEventOrders,
	getLatestBillPeriod,
	updateBillStatus,
} from "./billings";

vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));
// Achievements run fire-and-forget after an order; they have their own tests.
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));

setupTestDatabases();

const mail = vi.mocked(sendTenantMail);

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
	const wart = await createUser({ name: "Wart", roles: ["Getränkewart"] });
	signInAs(wart);
	return wart;
}

type BillingRun = Extract<
	Awaited<ReturnType<typeof createNewBilling>>,
	{ billPeriod: { id: string } }
>;

/** Runs a billing that is expected to create a period. */
async function runBilling(totalInventoryLoss?: number): Promise<BillingRun> {
	const result = await createNewBilling(totalInventoryLoss);
	if (!("billPeriod" in result) || !result.billPeriod) {
		throw new Error(`Billing created no period: ${result.message}`);
	}
	return result;
}

async function billAt(iso: string, totalInventoryLoss?: number) {
	vi.setSystemTime(new Date(iso));
	return runBilling(totalInventoryLoss);
}

async function periodByNumber(billNumber: string) {
	const [period] = await tenantDb()
		.select()
		.from(billPeriods)
		.where(eq(billPeriods.billNumber, billNumber));
	return period;
}

describe("createNewBilling", () => {
	test("throws for anonymous callers and writes nothing", async () => {
		await createTenant();
		const member = await createUser();
		await createOrderRow({ user: member });
		signOut();

		await expect(createNewBilling()).rejects.toThrow(/authenticated/);
		expect(await tenantDb().select().from(billPeriods)).toHaveLength(0);
	});

	test("does nothing when there are no unbilled orders", async () => {
		await setupKasse();
		const member = await createUser();
		await createOrderRow({ user: member, inBill: true });

		const result = await createNewBilling();

		expect(result).toMatchObject({ success: true, billsCreated: 0 });
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

		expect(result).toMatchObject({ billsCreated: 1, eventBillsCreated: 1 });
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
		expect((await getLatestBillPeriod())?.billNumber).toBe("KW-44-26");
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
			billsCreated: 0,
			eventBillsCreated: 2,
			totalAmount: 10.5,
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
		for (const user of residents) await createOrderRow({ user, drink });

		const result = await createNewBilling(30);

		expect(result.totalAmount).toBe(36);
		for (const user of residents) {
			expect((await billsOf(user.id))[0]).toMatchObject({
				drinksTotal: 2,
				umlage: 10,
				total: 12,
			});
		}
	});

	// #10: the Umlage is added to every member with orders instead of the
	// Hausbewohner it was divided among.
	test.fails("charges the Umlage to exactly the Hausbewohner (#10)", async () => {
		await setupKasse();
		const residentWithOrders = await createUser({ roles: ["Hausbewohner"] });
		const residentWithout = await createUser({ roles: ["Hausbewohner"] });
		const nonResident = await createUser();
		const drink = await createDrink({ price: 2 });
		await createOrderRow({ user: residentWithOrders, drink });
		await createOrderRow({ user: nonResident, drink });

		await createNewBilling(20);

		expect((await billsOf(nonResident.id))[0]?.umlage).toBe(0);
		expect((await billsOf(residentWithOrders.id))[0]?.umlage).toBe(10);
		expect((await billsOf(residentWithout.id))[0]?.umlage).toBe(10);
	});

	// New: with no Hausbewohner the divisor falls back to 1, so every billed
	// member is charged the whole inventory loss.
	test.fails("never collects more Umlage than the inventory loss (#10)", async () => {
		await setupKasse();
		const drink = await createDrink({ price: 1 });
		await createOrderRow({ user: await createUser(), drink });
		await createOrderRow({ user: await createUser(), drink });

		await createNewBilling(30);

		const rows = await tenantDb().select().from(bills);
		const collected = rows.reduce((sum, b) => sum + b.umlage, 0);
		expect(collected).toBeLessThanOrEqual(30);
	});

	// #13: fees (and therefore totals) are stored with sub-cent fractions.
	test.fails("rounds fees and totals to whole cents (#13)", async () => {
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

	// #15: the year part uses the calendar year, not the ISO week-year.
	test.fails("uses the ISO week-year at the turn of the year (#15)", async () => {
		await setupKasse();
		await createOrderRow({ user: await createUser() });

		// Friday 1 Jan 2027 belongs to ISO week 53 of 2026.
		const result = await billAt("2027-01-01T12:00:00Z");

		expect(result.billPeriod?.billNumber).toBe("KW-53-26");
	});

	// #15: the week is computed in the server's timezone. Correct (and
	// passing) under Europe/Berlin, wrong on a UTC server.
	(process.env.TZ === "UTC" ? test.fails : test)(
		"numbers the week in German time, not server time (#15)",
		async () => {
			await setupKasse();
			await createOrderRow({ user: await createUser() });

			// Sunday 23:30 UTC is already Monday of week 44 in Germany.
			const result = await billAt("2026-10-25T23:30:00Z");

			expect(result.billPeriod?.billNumber).toBe("KW-44-26");
		},
	);
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

		expect(result).toMatchObject({ success: true, billsCreated: 2 });
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
			success: true,
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

	test("closeBillPeriod stamps closedAt", async () => {
		await setupKasse();
		const period = await createBillPeriodRow();

		expect((await closeBillPeriod(period.id)).success).toBe(true);

		const [row] = await tenantDb()
			.select()
			.from(billPeriods)
			.where(eq(billPeriods.id, period.id));
		expect(row?.closedAt).toEqual(new Date(WEEK_43));
	});

	test("getBillingStatistics splits unbilled personal and group orders", async () => {
		await setupKasse();
		const a = await createUser({ name: "Alf" });
		const b = await createUser({ name: "Bert" });
		const drink = await createDrink({ price: 2 });
		await createOrderRow({ user: a, drink, amount: 2 });
		await createOrderRow({ user: b, drink });
		await createOrderRow({ user: b, drink, inBill: true });
		await createOrderRow({ user: a, drink, bookingFor: "CC" });
		await createOrderRow({ user: b, drink, amount: 3, bookingFor: "CC" });
		await createOrderRow({ user: b, drink, bookingFor: "AHV" });
		const period = await createBillPeriodRow();
		await createBillRow({ periodId: period.id, user: a, drinksTotal: 7 });
		await createBillRow({
			periodId: period.id,
			user: b,
			status: "Gestundet",
			drinksTotal: 100,
		});

		const stats = await getBillingStatistics();

		expect(stats?.unbilledOrders).toEqual({ count: 2, totalAmount: 6 });
		expect(stats?.eventOrders.count).toBe(3);
		expect(stats?.eventOrders.totalAmount).toBe(10);
		const cc = stats?.eventOrders.events.find((e) => e.name === "CC");
		expect(cc).toMatchObject({ orderCount: 2, totalAmount: 8 });
		expect(cc?.bookedBy.sort()).toEqual(["Alf", "Bert"]);
		expect(stats?.totalBillPeriods).toBe(1);
		expect(stats?.pendingBillsAmount).toBe(7);
	});

	test("getEventOrders returns only group orders, newest first", async () => {
		await setupKasse();
		const member = await createUser();
		await createOrderRow({ user: member });
		await createOrderRow({
			user: member,
			bookingFor: "CC",
			createdAt: new Date("2026-10-01T12:00:00Z"),
		});
		await createOrderRow({
			user: member,
			bookingFor: "AHV",
			inBill: true,
			createdAt: new Date("2026-10-10T12:00:00Z"),
		});

		const result = await getEventOrders();

		expect(result.map((o) => o.bookingFor)).toEqual(["AHV", "CC"]);
	});
});
