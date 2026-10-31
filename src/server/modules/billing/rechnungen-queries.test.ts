// Query budget of /rechnungen (#24): the server loads the open orders and
// the list of bill periods in parallel; no period's bills are read until its
// tab is opened or, for older periods, it is expanded. Before, the "Ältere
// Rechnungen" tab requested every past period at once.

import { describe, expect, test } from "vitest";
import { getCurrentOrders } from "~/server/actions/currentOrders";
import { auth } from "~/server/auth";
import {
	getAllBillPeriods,
	getBillsForPeriod,
} from "~/server/modules/billing/actions";
import {
	createBillPeriodRow,
	createBillRow,
} from "../../../../test/factories/billing";
import { createOrderRow, daysAgo } from "../../../../test/factories/inventory";
import {
	countQueries,
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
} from "../../../../test/harness";

setupTestDatabases();

/** Everything `src/app/(protected)/rechnungen/page.tsx` loads on the server. */
async function loadRechnungenPage() {
	const session = await auth();
	const [currentOrders, periods] = await Promise.all([
		getCurrentOrders(),
		getAllBillPeriods(),
	]);
	return { roles: session?.user?.roles ?? [], currentOrders, periods };
}

let round = 0;

/** `n` more bill periods, each billing every member in `users`, and open orders. */
async function addPeriods(users: TestUser[], n: number) {
	const drink = await createDrink({ name: `Pils ${++round}`, price: 1.5 });
	for (let i = 0; i < n; i++) {
		const period = await createBillPeriodRow({
			createdAt: daysAgo(100 - round * 10 - i),
		});
		for (const user of users) {
			await createBillRow({
				periodId: period.id,
				user,
				drinksTotal: 3,
				items: [{ drinkName: drink.name, amount: 2, pricePerDrink: 1.5 }],
			});
			await createOrderRow({ drink, user });
		}
	}
}

describe("Rechnungen page query budget (#24)", () => {
	test("the page load reads no bills and does not grow with the periods", async () => {
		await createTenant();
		const viewer = await createUser({ name: "Max" });
		const others = [await createUser({ name: "Moritz" }), viewer];
		signInAs(viewer);
		await addPeriods(others, 3);
		await loadRechnungenPage(); // warm the tenant and feature caches

		const small = await countQueries(loadRechnungenPage);
		await addPeriods(others, 7);
		const large = await countQueries(loadRechnungenPage);

		// Two data queries plus three auth() calls at 2 lookups each (the
		// page's and both loaders' guards; memoized per request in production).
		expect(small.total).toBe(2 + 2 * 3);
		expect(large.total).toBe(small.total);
		expect(large.result.periods).toHaveLength(10);
		expect(large.result.currentOrders).toHaveLength(2);
		const sql = large.log.flatMap((e) => e.sql).join("\n");
		expect(sql).not.toMatch(/from "bill"|from "bill_item"/);
	});

	test("expanding an older period loads that period alone in one round trip", async () => {
		await createTenant();
		const viewer = await createUser({ name: "Max" });
		signInAs(viewer);
		await addPeriods([viewer, await createUser({ name: "Moritz" })], 4);
		const { periods } = await loadRechnungenPage();
		const older = periods[3];
		if (!older) {
			throw new Error("expected four periods");
		}

		const expanded = await countQueries(() => getBillsForPeriod(older.id));

		// The bills and their items in one batch, plus the guard's 2 lookups.
		expect(expanded.total).toBe(1 + 2);
		expect(expanded.result).toHaveLength(2);
		expect(expanded.result.every((b) => b.items.length === 1)).toBe(true);
	});
});
