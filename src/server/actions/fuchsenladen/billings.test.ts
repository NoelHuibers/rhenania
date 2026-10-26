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

		const numbers = [];
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

	// A carried-over bill stays "Unbezahlt", so its amount is counted twice:
	// once on the old bill and again as oldBillingAmount on the new one.
	test.fails("counts carried-over debt only once in the pending total (#12)", async () => {
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

	// Only the immediately preceding period is consulted, so a member who
	// skipped one period loses their older debt.
	test.fails("keeps debt from periods before the last one (#12)", async () => {
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

	// Week 53 of 2026 runs into January 2027; the year is taken from the
	// calendar date instead of the ISO week-year.
	test.fails("uses the ISO week-year in the bill number (#15)", async () => {
		await setup();
		await createFuchsenOrder({
			user: await createUser(),
			item: await createFuchsenItem(),
		});

		const result = await runAt(new Date("2027-01-01T11:00:00Z"));

		expect(billNumberOf(result)).toBe("KW-53-26");
	});

	test.fails("sums line items without floating-point residue (#13)", async () => {
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

	// "Alle bezahlt" in the per-member view only flips order status; the
	// billing run picks those orders up again as an unpaid bill.
	test.fails("does not bill orders that were already marked paid (new)", async () => {
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

	// Paying a billed member's orders in the per-member view leaves their bill
	// "Unbezahlt", so the next run charges the amount again as old balance.
	test.fails("does not carry forward a bill whose orders were all paid (new)", async () => {
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

	test("reports unknown periods", async () => {
		await setup();

		expect(await getFuchsenBillPeriodCSV("missing")).toEqual({
			success: false,
			error: "Periode nicht gefunden",
		});
	});
});
