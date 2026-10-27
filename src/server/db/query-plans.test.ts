// Query plans of the hot order and bill queries (#25). Runs the real server
// code, takes the SQL and arguments it sent from the query log and asks
// SQLite how it executes them on the migrated tenant DB. Without the
// indexes from migration 0013 these queries walk every order, every paid
// bill or every bill item ever written.

import { describe, expect, test, vi } from "vitest";

import { updateBillStatus } from "~/server/actions/billings/billings";
import { getCurrentOrders } from "~/server/actions/currentOrders";
import { getOpenEntityBills } from "~/server/actions/getraenkewart/kasse";
import { getStockData } from "~/server/actions/inventur/inventur";
import { getUserOrders } from "~/server/actions/orders";
import { runGetraenkeBilling } from "~/server/lib/billing-run";
import { getRecentDrinkIds } from "~/server/lib/recent-drinks";
import {
	createBillPeriodRow,
	createBillRow,
	createOrderRow,
	eventUser,
	setUpGetraenkeBilling,
} from "../../../test/factories/billing";
import { createInventory, daysAgo } from "../../../test/factories/inventory";
import {
	countQueries,
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../test/harness";
import { requireTenant } from "../../../test/state";

vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));

setupTestDatabases();

type Plan = { sql: string; plan: string[] };

/**
 * Runs `fn` and returns the plan of every tenant statement it sent whose
 * SQL matches `pattern`, with the arguments it was sent with (a partial
 * index on `inBill = 0` only applies when the bound value is known).
 */
async function plansOf(pattern: RegExp, fn: () => Promise<unknown>) {
	const { log } = await countQueries(fn);
	const statements = log
		.filter((entry) => entry.db === "tenant")
		.flatMap((entry) =>
			entry.sql.map((sql, i) => ({ sql, args: entry.args[i] ?? [] })),
		)
		.filter(({ sql }) => pattern.test(sql));
	const plans: Plan[] = [];
	for (const { sql, args } of statements) {
		const result = await requireTenant().client.execute({
			sql: `EXPLAIN QUERY PLAN ${sql}`,
			args,
		});
		plans.push({ sql, plan: result.rows.map((row) => String(row.detail)) });
	}
	// Guards against a pattern that no longer matches what the code sends.
	expect(plans.length, `no statement matched ${pattern}`).toBeGreaterThan(0);
	return plans;
}

/** "SCAN order" / "SCAN bill" without an index: a full table scan. */
const FULL_SCAN = /^SCAN (order|bill|bill_item)$/;

function expectIndex(plans: Plan[], index: string) {
	for (const { sql, plan } of plans) {
		const steps = plan.join("\n");
		expect(steps, sql).toMatch(
			new RegExp(`USING (COVERING )?INDEX ${index}\\b`),
		);
		expect(
			plan.filter((step) => FULL_SCAN.test(step)),
			sql,
		).toEqual([]);
	}
}

describe("hot query plans use the composite indexes (#25)", () => {
	test("the billing run and the open-orders views read only unbilled orders", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Getränkewart"] }));
		await setUpGetraenkeBilling();
		const member = await createUser();
		await createOrderRow({ user: member });
		await createOrderRow({ user: member, bookingFor: "Stiftungsfest" });

		const unbilled = /^select .* from "order" where "order"\."inBill" = \?/;
		const open = await plansOf(unbilled, getCurrentOrders);
		expectIndex(open, "order_unbilled_created_idx");
		const run = await plansOf(unbilled, () =>
			runGetraenkeBilling({ inventoryLoss: 0 }),
		);
		expectIndex(run, "order_unbilled_user_idx");
		// Both read the unbilled orders already in the order they need.
		for (const { plan } of [...open, ...run]) {
			expect(plan.join("\n")).not.toMatch(/TEMP B-TREE/);
		}
	});

	test("stock sales since the last count read only that drink's recent orders", async () => {
		await createTenant();
		const drink = await createDrink({ name: "Pils", price: 1.5 });
		await createInventory({
			createdAt: daysAgo(3),
			items: [{ drink, countedStock: 20 }],
		});
		await createOrderRow({ user: await createUser(), drink });
		signInAs(await createUser({ roles: ["Getränkewart"] }));

		const plans = await plansOf(/"order"\."createdAt" >= /, getStockData);
		expectIndex(plans, "order_drink_created_idx");
		expect(plans[0]?.plan.join("\n")).toMatch(/drinkId=\? AND createdAt>\?/);
	});

	test("a member's orders are read in time order from their own index range", async () => {
		await createTenant();
		const member = await createUser();
		signInAs(member);
		await createOrderRow({ user: member });

		const profile = await plansOf(/from "order"/, getUserOrders);
		expectIndex(profile, "order_user_created_idx");
		expect(profile[0]?.plan.join("\n")).not.toMatch(/TEMP B-TREE FOR ORDER BY/);

		const recent = await plansOf(/from "order"/, () =>
			getRecentDrinkIds(member.id),
		);
		expectIndex(recent, "order_user_created_idx");
		expect(recent[0]?.plan.join("\n")).toMatch(/userId=\? AND createdAt>\?/);
	});

	test("paying and un-paying a bill only reads that member's bills", async () => {
		await createTenant();
		const member = await createUser();
		const old = await createBillPeriodRow({ createdAt: daysAgo(60) });
		const current = await createBillPeriodRow();
		await createBillRow({
			periodId: old.id,
			user: member,
			status: "Übertragen",
			drinksTotal: 5,
			createdAt: daysAgo(60),
		});
		const bill = await createBillRow({
			periodId: current.id,
			user: member,
			drinksTotal: 10,
		});
		signInAs(await createUser({ roles: ["Getränkewart"] }));

		const byMember = /"bill"\."userId" = \? and "bill"\."(status|createdAt)"/;
		const pay = await plansOf(byMember, () =>
			updateBillStatus(bill.id, "Bezahlt"),
		);
		const undo = await plansOf(byMember, () =>
			updateBillStatus(bill.id, "Unbezahlt"),
		);
		// Pay settles the carried bills; undo checks for a later bill paid
		// together with this one, then reopens the bills it settled.
		expect(pay).toHaveLength(1);
		expect(undo).toHaveLength(2);
		expectIndex([...pay, ...undo], "bill_user_status_idx");
	});

	test("group bills and their items are found without reading every bill item", async () => {
		await createTenant();
		const period = await createBillPeriodRow();
		await createBillRow({ periodId: period.id, user: await createUser() });
		await createBillRow({
			periodId: period.id,
			user: eventUser("Stiftungsfest"),
			items: [{ drinkName: "Pils", amount: 3, pricePerDrink: 1.5 }],
		});
		signInAs(await createUser({ roles: ["Getränkewart"] }));

		const plans = await plansOf(/LIKE 'event-%'/, getOpenEntityBills);
		expect(plans).toHaveLength(2);
		expectIndex(plans, "bill_user_nocase_idx");
		for (const { plan } of plans) {
			expect(plan.join("\n")).not.toMatch(/SCAN bill_item/);
		}
	});
});
