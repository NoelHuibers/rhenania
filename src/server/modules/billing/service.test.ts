// The billing service on its own (#33): called with a TenantScope over a
// local libSQL file and a fixed clock, without a server action, a session
// or a faked system time.

import { describe, expect, test, vi } from "vitest";

import { sendTenantMail } from "~/server/lib/mailer";
import {
	billsOf,
	createBillPeriodRow,
	createBillRow,
	createOrderRow,
	itemsOf,
	setUpGetraenkeBilling,
} from "../../../../test/factories/billing";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	tenantDb,
	testScope,
} from "../../../../test/harness";
import { runGetraenkeBilling } from "./run";
import {
	billsForPeriod,
	listBillPeriods,
	periodCsv,
	setBillStatus,
	userBillingData,
} from "./service";

vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));

setupTestDatabases();

/** Tuesday, 20 Oct 2026, 09:15:42.500 UTC: ISO week 43. */
const NOW = new Date("2026-10-20T09:15:42.500Z");
const LATER = new Date("2026-10-27T18:00:00Z");

async function memberWithBills() {
	await createTenant();
	const max = await createUser({ name: "Max" });
	const old = await createBillPeriodRow({
		createdAt: new Date("2026-09-01T10:00:00Z"),
	});
	const current = await createBillPeriodRow({
		createdAt: new Date("2026-10-01T10:00:00Z"),
	});
	const carried = await createBillRow({
		periodId: old.id,
		user: max,
		status: "Übertragen",
		drinksTotal: 4,
		createdAt: old.createdAt,
	});
	const latest = await createBillRow({
		periodId: current.id,
		user: max,
		drinksTotal: 6,
		oldBillingAmount: 4,
		createdAt: current.createdAt,
		items: [{ drinkName: "Pils", amount: 4, pricePerDrink: 1.5 }],
	});
	return { max, carried, latest, current };
}

describe("setBillStatus", () => {
	test("pays a bill and the bills carried into it at the scope's time", async () => {
		const { max, carried, latest } = await memberWithBills();

		await setBillStatus(testScope({ now: NOW }), latest.id, "Bezahlt");

		expect(
			(await billsOf(max.id)).map((b) => [b.id, b.status, b.paidAt]),
		).toEqual([
			[carried.id, "Bezahlt", new Date("2026-10-20T09:15:42Z")],
			[latest.id, "Bezahlt", new Date("2026-10-20T09:15:42Z")],
		]);
	});

	test("undoing the payment reopens what it settled, as carried", async () => {
		const { max, latest } = await memberWithBills();
		await setBillStatus(testScope({ now: NOW }), latest.id, "Bezahlt");

		await setBillStatus(testScope({ now: LATER }), latest.id, "Unbezahlt");

		expect(
			(await billsOf(max.id)).map((b) => [b.status, b.paidAt, b.updatedAt]),
		).toEqual([
			["Übertragen", null, new Date("2026-10-27T18:00:00Z")],
			["Unbezahlt", null, new Date("2026-10-27T18:00:00Z")],
		]);
	});

	test("refuses what only a run or the later bill may change", async () => {
		const { carried, latest } = await memberWithBills();
		const scope = testScope({ now: NOW });

		await expect(
			setBillStatus(scope, latest.id, "Übertragen"),
		).rejects.toMatchObject({ code: "INVALID_INPUT" });
		await expect(
			setBillStatus(scope, carried.id, "Bezahlt"),
		).rejects.toMatchObject({ code: "CARRIED_BILL" });
		await expect(setBillStatus(scope, "missing", "Bezahlt")).rejects.toThrow(
			"Rechnung nicht gefunden",
		);
	});
});

describe("reads", () => {
	test("periods newest first; a period's bills with their items", async () => {
		const { latest, current } = await memberWithBills();
		const scope = testScope({ now: NOW });

		expect((await listBillPeriods(scope)).map((p) => p.id)[0]).toBe(current.id);
		expect(await billsForPeriod(scope, current.id)).toEqual([
			expect.objectContaining({
				id: latest.id,
				name: "Max",
				totalDue: 10,
				items: [
					expect.objectContaining({ name: "Pils", quantity: 4, subtotal: 6 }),
				],
			}),
		]);
	});

	test("a failed query is an error, not an empty list", async () => {
		await createTenant();
		await tenantDb().$client.execute("DROP TABLE bill_item");

		await expect(
			billsForPeriod(testScope({ now: NOW }), "any"),
		).rejects.toThrow(/no such table/);
	});

	test("the member's latest bill for the profile, with a fee line", async () => {
		const { max, latest } = await memberWithBills();
		await tenantDb().$client.execute({
			sql: "UPDATE bill SET fees = 0.4, total = 10.4 WHERE id = ?",
			args: [latest.id],
		});

		const data = await userBillingData(testScope({ now: NOW }), max.id);

		expect(data.billData).toMatchObject({ billId: latest.id, total: 10.4 });
		expect(data.billItems).toEqual([
			{ item: "Pils", quantity: 4, price: 1.5, total: 6 },
			{ item: "Service Fee", quantity: 1, price: 0.4, total: 0.4 },
		]);
	});

	test("an unknown period has no CSV", async () => {
		await createTenant();

		await expect(
			periodCsv(testScope({ now: NOW }), "missing"),
		).rejects.toMatchObject({ code: "CSV_FAILED" });
	});
});

describe("runGetraenkeBilling", () => {
	test("bills at the scope's time: bill number, dates and whole seconds", async () => {
		await createTenant();
		await setUpGetraenkeBilling();
		const wart = await createUser({ name: "Wart" });
		const max = await createUser({ name: "Max" });
		const pils = await createDrink({ name: "Pils", price: 1.5 });
		await createOrderRow({ user: max, drink: pils, amount: 2 });

		const run = await runGetraenkeBilling(testScope({ now: NOW }), wart, {
			inventoryLoss: 0,
		});

		expect(run).toMatchObject({
			success: true,
			billsCreated: 1,
			totalAmount: 3,
			billPeriod: { billNumber: "KW-43-26" },
		});
		const [bill] = await billsOf(max.id);
		// Stored in whole seconds, as the mailed PDF shows it.
		expect(bill).toMatchObject({
			total: 3,
			status: "Unbezahlt",
			createdAt: new Date("2026-10-20T09:15:42Z"),
		});
		expect((await itemsOf(bill?.id ?? "")).map((i) => i.amount)).toEqual([2]);
		expect(vi.mocked(sendTenantMail)).toHaveBeenCalledOnce();
	});

	test("refuses without the tenant's sender and account, writing nothing", async () => {
		await createTenant();
		const max = await createUser();
		await createOrderRow({ user: max });

		await expect(
			runGetraenkeBilling(testScope({ now: NOW }), max, { inventoryLoss: 0 }),
		).rejects.toMatchObject({
			code: "BILLING_FAILED",
			message: expect.stringMatching(/^Bitte Absender und Konto/),
		});
		expect(await billsOf(max.id)).toEqual([]);
	});
});
