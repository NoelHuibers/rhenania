import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	fuchsenBillPeriods,
	fuchsenBills,
	fuchsenOrders,
} from "~/server/db/schema";
import {
	createFuchsenBillPeriod,
	createFuchsenItem,
	createFuchsenOrder,
} from "../../../../test/factories/fuchsenladen";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";
import {
	closeFuchsenBillPeriod,
	createNewFuchsenBilling,
	getAllFuchsenBillPeriods,
	getFuchsenBillingStatistics,
	getFuchsenBillPeriodCSV,
	getFuchsenBillsForPeriod,
	getLatestFuchsenBillPeriod,
	getMyFuchsenBills,
	getUnbilledFuchsenOrdersGrouped,
	updateFuchsenBillStatus,
} from "./billings";
import { markAllUserFuchsenOrdersPaid } from "./orders";

setupTestDatabases();

// Wednesday of ISO week 44/2026, midday in both Berlin and UTC.
const RUN_1 = new Date("2026-10-28T11:00:00Z");
const RUN_2 = new Date("2026-11-11T11:00:00Z");
const RUN_3 = new Date("2026-11-25T11:00:00Z");

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(RUN_1);
	vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
});

let fuchsenwart: TestUser;

async function setup() {
	await createTenant();
	fuchsenwart = await createUser({ name: "Fuchsenwart", roles: ["Fuchs"] });
	signInAs(fuchsenwart);
}

async function billsOf(user: TestUser) {
	return tenantDb()
		.select()
		.from(fuchsenBills)
		.where(eq(fuchsenBills.userId, user.id))
		.orderBy(fuchsenBills.createdAt);
}

function billNumberOf(
	result: Awaited<ReturnType<typeof createNewFuchsenBilling>>,
) {
	return "billPeriod" in result ? result.billPeriod?.billNumber : undefined;
}

async function runAt(date: Date) {
	vi.setSystemTime(date);
	return createNewFuchsenBilling();
}

describe("createNewFuchsenBilling", () => {
	test("does nothing when there are no unbilled orders", async () => {
		await setup();

		const result = await createNewFuchsenBilling();

		expect(result).toMatchObject({ success: true, billsCreated: 0 });
		expect(await tenantDb().select().from(fuchsenBillPeriods)).toHaveLength(0);
	});

	test("creates one bill per member with consolidated line items", async () => {
		await setup();
		const anton = await createUser({ name: "Anton" });
		const berta = await createUser({ name: "Berta" });
		const mars = await createFuchsenItem({ name: "Mars", price: 1.5 });
		const twix = await createFuchsenItem({ name: "Twix", price: 2 });
		await createFuchsenOrder({ user: anton, item: mars, amount: 2 });
		await createFuchsenOrder({ user: anton, item: twix, amount: 1 });
		await createFuchsenOrder({ user: anton, item: mars, amount: 1 });
		await createFuchsenOrder({ user: berta, item: twix, amount: 3 });

		const result = await createNewFuchsenBilling();

		expect(result).toMatchObject({
			success: true,
			billsCreated: 2,
			totalAmount: 12.5,
			billPeriod: { billNumber: "KW-44-26" },
		});
		const [period] = await tenantDb().select().from(fuchsenBillPeriods);
		expect(period).toMatchObject({
			billNumber: "KW-44-26",
			totalAmount: 12.5,
			createdBy: fuchsenwart.id,
			closedAt: null,
		});

		const bills = await getFuchsenBillsForPeriod(period?.id ?? "");
		expect(bills).toEqual([
			{
				id: expect.any(String),
				name: "Anton",
				totalDue: 6.5,
				status: "Unbezahlt",
				oldBillingAmount: 0,
				itemsTotal: 6.5,
				paidAt: null,
				items: expect.arrayContaining([
					expect.objectContaining({
						name: "Mars",
						quantity: 3,
						unitPrice: 1.5,
						subtotal: 4.5,
					}),
					expect.objectContaining({
						name: "Twix",
						quantity: 1,
						unitPrice: 2,
						subtotal: 2,
					}),
				]),
			},
			expect.objectContaining({ name: "Berta", totalDue: 6, itemsTotal: 6 }),
		]);
		expect(bills[0]?.items).toHaveLength(2);

		const orders = await tenantDb().select().from(fuchsenOrders);
		expect(orders.every((o) => o.billId !== null)).toBe(true);
		expect(await getUnbilledFuchsenOrdersGrouped()).toEqual([]);
	});

	test("numbers repeated runs in the same week with a suffix", async () => {
		await setup();
		const member = await createUser();
		const item = await createFuchsenItem();

		const numbers: Array<string | undefined> = [];
		for (const minutes of [0, 10, 20]) {
			await createFuchsenOrder({ user: member, item });
			const result = await runAt(new Date(RUN_1.getTime() + minutes * 60_000));
			numbers.push(billNumberOf(result));
		}

		expect(numbers).toEqual(["KW-44-26", "KW-44-26-2", "KW-44-26-3"]);
	});

	test("carries unpaid and deferred amounts of the last period forward and closes it", async () => {
		await setup();
		const unpaid = await createUser({ name: "Unbezahlt" });
		const deferred = await createUser({ name: "Gestundet" });
		const paid = await createUser({ name: "Bezahlt" });
		const { period: last } = await createFuchsenBillPeriod({
			createdAt: new Date("2026-10-14T11:00:00Z"),
			bills: [
				{ user: unpaid, itemsTotal: 4 },
				{ user: deferred, itemsTotal: 3, status: "Gestundet" },
				{ user: paid, itemsTotal: 5, status: "Bezahlt" },
			],
		});
		const item = await createFuchsenItem({ price: 1 });
		for (const user of [unpaid, deferred, paid]) {
			await createFuchsenOrder({ user, item, amount: 2 });
		}

		await createNewFuchsenBilling();

		const [closed] = await tenantDb()
			.select()
			.from(fuchsenBillPeriods)
			.where(eq(fuchsenBillPeriods.id, last.id));
		expect(closed?.closedAt).toEqual(RUN_1);
		const latest = await getLatestFuchsenBillPeriod();
		expect(latest?.totalAmount).toBe(13);
		const bills = await getFuchsenBillsForPeriod(latest?.id ?? "");
		expect(
			bills.map((b) => [b.name, b.itemsTotal, b.oldBillingAmount, b.totalDue]),
		).toEqual([
			["Bezahlt", 2, 0, 2],
			["Gestundet", 2, 3, 5],
			["Unbezahlt", 2, 4, 6],
		]);
		expect(await getAllFuchsenBillPeriods()).toHaveLength(2);
	});

	test("is refused for members without the Fuchs or Admin role", async () => {
		await createTenant();
		const member = await createUser();
		await createFuchsenOrder({ user: member, item: await createFuchsenItem() });
		signInAs(member);

		const result = await createNewFuchsenBilling();

		expect(result).toMatchObject({ success: false, billsCreated: 0 });
		expect(await tenantDb().select().from(fuchsenBills)).toHaveLength(0);
	});

	// The carried-over bill is closed out as "Übertragen", so its amount is
	// counted once: as oldBillingAmount on the new bill.
	test("counts carried-over debt only once in the pending total (#12)", async () => {
		await setup();
		const member = await createUser();
		const item = await createFuchsenItem({ price: 5 });
		await createFuchsenOrder({ user: member, item });
		await runAt(RUN_1);
		await createFuchsenOrder({ user: member, item });
		await runAt(RUN_2);

		const stats = await getFuchsenBillingStatistics();

		expect(stats?.pendingBillsAmount).toBe(10);
	});

	// Debt from every earlier period is carried, also for a member who
	// skipped a period.
	test("keeps debt from periods before the last one (#12)", async () => {
		await setup();
		const debtor = await createUser({ name: "Debtor" });
		const other = await createUser({ name: "Other" });
		const item = await createFuchsenItem({ price: 4 });
		await createFuchsenOrder({ user: debtor, item });
		await runAt(RUN_1);
		await createFuchsenOrder({ user: other, item });
		await runAt(RUN_2);
		await createFuchsenOrder({ user: debtor, item });
		await runAt(RUN_3);

		const bills = await billsOf(debtor);

		expect(bills.at(-1)).toMatchObject({
			itemsTotal: 4,
			oldBillingAmount: 4,
			total: 8,
		});
	});

	// Week 53 of 2026 runs into January 2027; the year is the ISO week-year,
	// not the calendar year.
	test("uses the ISO week-year in the bill number (#15)", async () => {
		await setup();
		await createFuchsenOrder({
			user: await createUser(),
			item: await createFuchsenItem(),
		});

		const result = await runAt(new Date("2027-01-01T11:00:00Z"));

		expect(billNumberOf(result)).toBe("KW-53-26");
	});

	test("sums line items without floating-point residue (#13)", async () => {
		await setup();
		const member = await createUser();
		await createFuchsenOrder({
			user: member,
			item: await createFuchsenItem({ name: "Kaugummi", price: 0.1 }),
		});
		await createFuchsenOrder({
			user: member,
			item: await createFuchsenItem({ name: "Lolli", price: 0.2 }),
		});

		await createNewFuchsenBilling();

		const [bill] = await billsOf(member);
		expect(bill?.total).toBe(0.3);
	});

	// Orders paid in the per-member view ("Alle bezahlt") are settled and
	// must not end up on a new unpaid bill.
	test("does not bill orders that were already marked paid (#143)", async () => {
		await setup();
		const member = await createUser();
		const item = await createFuchsenItem({ price: 3 });
		await createFuchsenOrder({ user: member, item });
		await markAllUserFuchsenOrdersPaid(member.id);
		await createFuchsenOrder({ user: member, item, amount: 2 });

		await createNewFuchsenBilling();

		const [bill] = await billsOf(member);
		expect(bill?.total).toBe(6);
	});

	// Paying a billed member's orders in the per-member view settles their
	// bill, so the next run carries nothing forward.
	test("does not carry forward a bill whose orders were all paid (#143)", async () => {
		await setup();
		const member = await createUser();
		const item = await createFuchsenItem({ price: 3 });
		await createFuchsenOrder({ user: member, item });
		await runAt(RUN_1);
		await markAllUserFuchsenOrdersPaid(member.id);
		await createFuchsenOrder({ user: member, item });

		await runAt(RUN_2);

		const bills = await billsOf(member);
		expect(bills.at(-1)?.oldBillingAmount).toBe(0);
	});
});

describe("carry-over across periods (#12, #143)", () => {
	const RUN_4 = new Date("2026-12-09T11:00:00Z");

	async function ordersOf(user: TestUser) {
		return tenantDb()
			.select()
			.from(fuchsenOrders)
			.where(eq(fuchsenOrders.userId, user.id))
			.orderBy(fuchsenOrders.createdAt);
	}

	/** Sum of a member's open bills and of their open billed orders. */
	async function openAmounts(user: TestUser) {
		const bills = await billsOf(user);
		const orders = await ordersOf(user);
		const cents = (n: number) => Math.round(n * 100);
		return {
			bills: bills
				.filter((b) => b.status === "Unbezahlt" || b.status === "Gestundet")
				.reduce((s, b) => s + cents(b.total), 0),
			orders: orders
				.filter((o) => o.status === "Offen" && o.billId !== null)
				.reduce((s, o) => s + cents(o.total), 0),
		};
	}

	test("rolls the debt forward once and settles every carried bill on payment", async () => {
		await setup();
		const member = await createUser({ name: "Fux" });
		const item = await createFuchsenItem({ price: 2.5 });

		// P1: 10 € (4 × 2.50 €).
		await createFuchsenOrder({ user: member, item, amount: 4 });
		await runAt(RUN_1);
		// P2: +5 €, carries 10 €.
		vi.setSystemTime(RUN_2);
		await createFuchsenOrder({ user: member, item, amount: 2 });
		await runAt(RUN_2);
		// P3: +2.50 €, carries 15 €.
		vi.setSystemTime(RUN_3);
		await createFuchsenOrder({ user: member, item, amount: 1 });
		await runAt(RUN_3);

		let bills = await billsOf(member);
		expect(
			bills.map((b) => [b.status, b.itemsTotal, b.oldBillingAmount, b.total]),
		).toEqual([
			["Übertragen", 10, 0, 10],
			["Übertragen", 5, 10, 15],
			["Unbezahlt", 2.5, 15, 17.5],
		]);
		expect((await getFuchsenBillingStatistics())?.pendingBillsAmount).toBe(
			17.5,
		);
		expect(await openAmounts(member)).toEqual({ bills: 1750, orders: 1750 });

		// Carried bills can't be paid on their own: they live on in P3.
		const [p1, , p3] = bills;
		expect(await updateFuchsenBillStatus(p1?.id ?? "", "Bezahlt")).toEqual({
			success: false,
			error:
				"Diese Rechnung wurde in eine spätere Rechnung übertragen und wird dort bezahlt",
		});

		vi.setSystemTime(RUN_4);
		expect(await updateFuchsenBillStatus(p3?.id ?? "", "Bezahlt")).toEqual({
			success: true,
		});

		bills = await billsOf(member);
		expect(bills.map((b) => b.status)).toEqual([
			"Bezahlt",
			"Bezahlt",
			"Bezahlt",
		]);
		expect(bills.every((b) => b.paidAt?.getTime() === RUN_4.getTime())).toBe(
			true,
		);
		expect((await ordersOf(member)).every((o) => o.status === "Bezahlt")).toBe(
			true,
		);
		expect((await getFuchsenBillingStatistics())?.pendingBillsAmount).toBe(0);

		// A later run starts from a clean slate.
		await createFuchsenOrder({ user: member, item, amount: 1 });
		await runAt(new Date("2026-12-16T11:00:00Z"));
		expect((await billsOf(member)).at(-1)).toMatchObject({
			oldBillingAmount: 0,
			total: 2.5,
		});
	});

	test("undoing the payment of a consolidated bill reopens what it carried", async () => {
		await setup();
		const member = await createUser();
		const item = await createFuchsenItem({ price: 3 });
		await createFuchsenOrder({ user: member, item });
		await runAt(RUN_1);
		vi.setSystemTime(RUN_2);
		await createFuchsenOrder({ user: member, item });
		await runAt(RUN_2);
		const [, consolidated] = await billsOf(member);
		vi.setSystemTime(RUN_3);
		await updateFuchsenBillStatus(consolidated?.id ?? "", "Bezahlt");

		await updateFuchsenBillStatus(consolidated?.id ?? "", "Unbezahlt");

		expect(
			(await billsOf(member)).map((b) => [b.status, b.paidAt, b.total]),
		).toEqual([
			["Übertragen", null, 3],
			["Unbezahlt", null, 6],
		]);
		expect((await ordersOf(member)).map((o) => o.status)).toEqual([
			"Offen",
			"Offen",
		]);
		expect(await openAmounts(member)).toEqual({ bills: 600, orders: 600 });
	});

	test("gives members with debt but no new orders a carry-only bill", async () => {
		await setup();
		const debtor = await createUser({ name: "Debtor" });
		const deferred = await createUser({ name: "Deferred" });
		const other = await createUser({ name: "Other" });
		const item = await createFuchsenItem({ price: 4 });
		await createFuchsenOrder({ user: debtor, item });
		await createFuchsenOrder({ user: deferred, item, amount: 2 });
		await runAt(RUN_1);
		const [deferredBill] = await billsOf(deferred);
		await updateFuchsenBillStatus(deferredBill?.id ?? "", "Gestundet");
		await createFuchsenOrder({ user: other, item });

		const result = await runAt(RUN_2);

		expect(result).toMatchObject({ billsCreated: 3, totalAmount: 16 });
		const latest = await getLatestFuchsenBillPeriod();
		expect(latest?.totalAmount).toBe(16);
		const bills = await getFuchsenBillsForPeriod(latest?.id ?? "");
		expect(
			bills.map((b) => [
				b.name,
				b.status,
				b.itemsTotal,
				b.oldBillingAmount,
				b.totalDue,
				b.items.length,
			]),
		).toEqual([
			["Debtor", "Unbezahlt", 0, 4, 4, 0],
			["Deferred", "Unbezahlt", 0, 8, 8, 0],
			["Other", "Unbezahlt", 4, 0, 4, 1],
		]);
		expect((await billsOf(debtor))[0]?.status).toBe("Übertragen");
		expect((await billsOf(deferred))[0]?.status).toBe("Übertragen");

		// P3: the debt moves on from the carry-only bill exactly once.
		await createFuchsenOrder({ user: debtor, item });
		await runAt(RUN_3);
		expect((await billsOf(debtor)).map((b) => [b.status, b.total])).toEqual([
			["Übertragen", 4],
			["Übertragen", 4],
			["Unbezahlt", 8],
		]);
		expect(await openAmounts(debtor)).toEqual({ bills: 800, orders: 800 });
	});

	test("open bills always equal open billed orders over several runs", async () => {
		await setup();
		const members = [
			await createUser({ name: "A" }),
			await createUser({ name: "B" }),
			await createUser({ name: "C" }),
		];
		const items = [
			await createFuchsenItem({ price: 0.1 }),
			await createFuchsenItem({ price: 1.15 }),
			await createFuchsenItem({ price: 2.35 }),
		];
		const runs = [RUN_1, RUN_2, RUN_3, RUN_4];
		for (const [r, run] of runs.entries()) {
			vi.setSystemTime(run);
			for (const [m, member] of members.entries()) {
				// Not everyone orders every period.
				if ((r + m) % 3 !== 2) {
					const item = items[(r * 2 + m) % items.length];
					if (item) {
						await createFuchsenOrder({ user: member, item, amount: r + m + 1 });
					}
				}
			}
			await runAt(run);
			// Member A pays their latest bill after the second run.
			if (r === 1) {
				const latest = (await billsOf(members[0] as TestUser)).at(-1);
				await updateFuchsenBillStatus(latest?.id ?? "", "Bezahlt");
			}
			for (const member of members) {
				const open = await openAmounts(member);
				expect(open.bills).toBe(open.orders);
				const outstanding = (await billsOf(member)).filter(
					(b) => b.status === "Unbezahlt" || b.status === "Gestundet",
				);
				// At most one open bill per member: older ones are carried.
				expect(outstanding.length).toBeLessThanOrEqual(1);
				for (const bill of await billsOf(member)) {
					expect(bill.total).toBe(Math.round(bill.total * 100) / 100);
				}
			}
		}
	});

	test("leaves orders paid before billing out of the preview and the statistics", async () => {
		await setup();
		const member = await createUser({ name: "Paid" });
		const item = await createFuchsenItem({ price: 3 });
		await createFuchsenOrder({ user: member, item, status: "Bezahlt" });
		await createFuchsenOrder({ user: member, item, amount: 2 });

		expect(await getUnbilledFuchsenOrdersGrouped()).toEqual([
			expect.objectContaining({ name: "Paid", totalDue: 6 }),
		]);
		expect((await getFuchsenBillingStatistics())?.unbilledOrders).toEqual({
			count: 1,
			totalAmount: 6,
		});

		await createNewFuchsenBilling();

		const orders = await ordersOf(member);
		expect(orders.find((o) => o.status === "Bezahlt")?.billId).toBeNull();
		expect(await getUnbilledFuchsenOrdersGrouped()).toEqual([]);
		// Nothing billable left: a second run creates no period.
		expect(await runAt(RUN_2)).toMatchObject({ billsCreated: 0 });
	});

	test("refuses status changes of unknown bills", async () => {
		await setup();

		expect(await updateFuchsenBillStatus("missing", "Bezahlt")).toEqual({
			success: false,
			error: "Rechnung nicht gefunden",
		});
	});
});

describe("updateFuchsenBillStatus", () => {
	test("keeps the bill's orders in sync with the bill status", async () => {
		await setup();
		const member = await createUser();
		const item = await createFuchsenItem();
		await createFuchsenOrder({ user: member, item });
		await createFuchsenOrder({ user: member, item });
		await createNewFuchsenBilling();
		const [bill] = await billsOf(member);
		const billId = bill?.id ?? "";
		const ordersOfBill = () =>
			tenantDb()
				.select()
				.from(fuchsenOrders)
				.where(eq(fuchsenOrders.billId, billId));

		expect(await updateFuchsenBillStatus(billId, "Bezahlt")).toEqual({
			success: true,
		});
		expect((await billsOf(member))[0]).toMatchObject({
			status: "Bezahlt",
			paidAt: RUN_1,
		});
		for (const order of await ordersOfBill()) {
			expect(order).toMatchObject({ status: "Bezahlt", paidAt: RUN_1 });
		}

		await updateFuchsenBillStatus(billId, "Gestundet");
		expect((await billsOf(member))[0]).toMatchObject({
			status: "Gestundet",
			paidAt: null,
		});
		for (const order of await ordersOfBill()) {
			expect(order).toMatchObject({ status: "Offen", paidAt: null });
		}
	});

	test("is refused for plain members", async () => {
		await setup();
		const member = await createUser();
		const { bills } = await createFuchsenBillPeriod({
			bills: [{ user: member, itemsTotal: 3 }],
		});
		signInAs(member);

		const result = await updateFuchsenBillStatus(bills[0]?.id ?? "", "Bezahlt");

		expect(result).toEqual({ success: false, error: "Keine Berechtigung" });
		expect((await billsOf(member))[0]?.status).toBe("Unbezahlt");
	});

	/** P1 carried into P2, and P2 paid at RUN_3. */
	async function paidThroughP2() {
		await setup();
		const member = await createUser();
		const item = await createFuchsenItem({ price: 3 });
		await createFuchsenOrder({ user: member, item });
		await runAt(RUN_1);
		await createFuchsenOrder({ user: member, item });
		await runAt(RUN_2);
		const [p1, p2] = await billsOf(member);
		vi.setSystemTime(RUN_3);
		await updateFuchsenBillStatus(p2?.id ?? "", "Bezahlt");
		return { member, p1: p1?.id ?? "", p2: p2?.id ?? "" };
	}

	test("refuses to reopen a bill that was paid through the later bill it was carried into (#183)", async () => {
		const { member, p1 } = await paidThroughP2();

		for (const status of ["Unbezahlt", "Gestundet", "Bezahlt"] as const) {
			expect(await updateFuchsenBillStatus(p1, status)).toEqual({
				success: false,
				error:
					"Diese Rechnung wurde mit der späteren Rechnung bezahlt, in die sie übertragen wurde. Ändere den Status dort.",
			});
		}
		expect((await billsOf(member)).map((b) => [b.status, b.paidAt])).toEqual([
			["Bezahlt", RUN_3],
			["Bezahlt", RUN_3],
		]);
		const orders = await tenantDb()
			.select()
			.from(fuchsenOrders)
			.where(eq(fuchsenOrders.userId, member.id));
		expect(orders.map((o) => o.status)).toEqual(["Bezahlt", "Bezahlt"]);
	});

	test("marking the paid bill paid again keeps the bills it settled tied to it (#183)", async () => {
		const { member, p1, p2 } = await paidThroughP2();
		vi.setSystemTime(new Date("2026-11-26T11:00:00Z"));

		expect(await updateFuchsenBillStatus(p2, "Bezahlt")).toEqual({
			success: true,
		});

		expect((await billsOf(member)).map((b) => b.paidAt)).toEqual([
			RUN_3,
			RUN_3,
		]);
		expect(await updateFuchsenBillStatus(p1, "Unbezahlt")).toMatchObject({
			success: false,
		});
	});
});

describe("closeFuchsenBillPeriod", () => {
	test("sets closedAt on the period", async () => {
		await setup();
		const { period } = await createFuchsenBillPeriod();

		expect((await closeFuchsenBillPeriod(period.id)).success).toBe(true);
		expect((await getLatestFuchsenBillPeriod())?.closedAt).toEqual(RUN_1);
	});
});

describe("read models", () => {
	test("groups unbilled orders per member and item, sorted by name", async () => {
		await setup();
		const zora = await createUser({ name: "Zora" });
		const anton = await createUser({ name: "Anton" });
		const mars = await createFuchsenItem({ name: "Mars", price: 1 });
		await createFuchsenOrder({ user: zora, item: mars, amount: 1 });
		await createFuchsenOrder({ user: anton, item: mars, amount: 1 });
		await createFuchsenOrder({ user: anton, item: mars, amount: 2 });
		await createFuchsenOrder({
			user: anton,
			item: mars,
			billId: "already-billed",
		});

		const grouped = await getUnbilledFuchsenOrdersGrouped();

		expect(grouped).toEqual([
			{
				id: anton.id,
				name: "Anton",
				totalDue: 3,
				items: [expect.objectContaining({ quantity: 3, subtotal: 3 })],
			},
			expect.objectContaining({ id: zora.id, totalDue: 1 }),
		]);
	});

	test("statistics summarise unbilled orders, periods and unpaid bills", async () => {
		await setup();
		const member = await createUser();
		await createFuchsenBillPeriod({
			bills: [
				{ user: member, itemsTotal: 4 },
				{ user: fuchsenwart, itemsTotal: 2, status: "Bezahlt" },
			],
		});
		const item = await createFuchsenItem({ price: 1.5 });
		await createFuchsenOrder({ user: member, item, amount: 2 });

		expect(await getFuchsenBillingStatistics()).toEqual({
			unbilledOrders: { count: 1, totalAmount: 3 },
			totalBillPeriods: 1,
			pendingBillsAmount: 4,
		});
	});

	test("members see only their own bills, newest first, with line items", async () => {
		await setup();
		const member = await createUser();
		const other = await createUser();
		const item = await createFuchsenItem({ name: "Mars", price: 2 });
		await createFuchsenOrder({ user: member, item });
		await createFuchsenOrder({ user: other, item });
		await runAt(RUN_1);
		await createFuchsenOrder({ user: member, item, amount: 2 });
		await runAt(RUN_2);
		signInAs(member);

		const mine = await getMyFuchsenBills();

		expect(mine.map((m) => m.period?.billNumber)).toEqual([
			"KW-46-26",
			"KW-44-26",
		]);
		expect(mine[0]?.bill).toMatchObject({
			itemsTotal: 4,
			items: [{ name: "Mars", quantity: 2, unitPrice: 2, subtotal: 4 }],
		});
	});
});

describe("getFuchsenBillPeriodCSV", () => {
	test("exports a semicolon CSV with German decimals and a BOM", async () => {
		await setup();
		const { period } = await createFuchsenBillPeriod({
			billNumber: "KW-44-26",
			bills: [
				{ user: await createUser({ name: "Berta" }), itemsTotal: 2.5 },
				{
					user: await createUser({ name: "Anton" }),
					itemsTotal: 1,
					oldBillingAmount: 3.25,
					status: "Gestundet",
				},
			],
		});

		const result = await getFuchsenBillPeriodCSV(period.id);

		expect(result).toMatchObject({
			success: true,
			fileName: "Fuchsenrechnung_KW-44-26.csv",
		});
		expect(result.csvContent?.startsWith("﻿")).toBe(true);
		expect(result.csvContent?.slice(1).split("\r\n")).toEqual([
			"Name;Status;Artikel;Alter Saldo;Gesamt",
			"Anton;Gestundet;1,00;3,25;4,25",
			"Berta;Unbezahlt;2,50;0,00;2,50",
			"Gesamt;;;;6,75",
		]);
	});

	test("quotes names with semicolons and defuses formulas (#91)", async () => {
		await setup();
		const { period } = await createFuchsenBillPeriod({
			bills: [
				{
					user: await createUser({ name: '=HYPERLINK("http://x";"Hi")' }),
					itemsTotal: 1,
				},
				{ user: await createUser({ name: "Müller; Max" }), itemsTotal: 2 },
			],
		});

		const result = await getFuchsenBillPeriodCSV(period.id);

		expect(result.csvContent?.slice(1).split("\r\n").slice(1, 3)).toEqual([
			'"\'=HYPERLINK(""http://x"";""Hi"")";Unbezahlt;1,00;0,00;1,00',
			'"Müller; Max";Unbezahlt;2,00;0,00;2,00',
		]);
	});

	test("reports unknown periods", async () => {
		await setup();

		expect(await getFuchsenBillPeriodCSV("missing")).toEqual({
			success: false,
			error: "Periode nicht gefunden",
		});
	});
});
