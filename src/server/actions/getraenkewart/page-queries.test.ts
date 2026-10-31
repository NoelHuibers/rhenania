// Query budget of the Getränkewart page and the bill lists (#25): every
// loader issues a constant number of round trips, however many drinks,
// inventories and bills there are.

import { describe, expect, test } from "vitest";
import {
	getFuchsenBillsForPeriod,
	getMyFuchsenBills,
} from "~/server/actions/fuchsenladen/billings";
import {
	getBankEntries,
	getExternalBills,
	getGetraenkeSettings,
	getKasseSummary,
	getOpenEntityBills,
	getOpenMemberBills,
	getPfandWert,
} from "~/server/actions/getraenkewart/kasse";
import {
	getActiveEventInventory,
	getInventoryHistory,
	getInventoryProfit,
	getStockData,
	listEtaplansWithKostenpunkte,
	listInventurEvents,
} from "~/server/actions/inventur/inventur";
import { fuchsenBillItems } from "~/server/db/schema";
import { getBillsForPeriod } from "~/server/modules/billing/actions";
import {
	createBillPeriodRow,
	createBillRow,
	eventUser,
} from "../../../../test/factories/billing";
import { createFuchsenBillPeriod } from "../../../../test/factories/fuchsenladen";
import {
	createInventory,
	createOrderRow,
	daysAgo,
} from "../../../../test/factories/inventory";
import {
	countQueries,
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";

setupTestDatabases();

/** Everything `src/app/(protected)/getraenkewart/page.tsx` loads. */
function loadGetraenkewartPage() {
	return Promise.all([
		getKasseSummary(),
		getBankEntries(),
		getExternalBills(),
		getOpenEntityBills(),
		getOpenMemberBills(),
		getPfandWert(),
		getStockData(),
		getInventoryHistory(),
		getActiveEventInventory(),
		listInventurEvents(),
		listEtaplansWithKostenpunkte(),
		getInventoryProfit(),
		getGetraenkeSettings(),
	]);
}

let round = 0;

/** Adds `n` drinks, each with orders, closed inventories and group bills. */
async function addHistory(n: number) {
	const period = await createBillPeriodRow();
	for (let i = 0; i < n; i++) {
		round++;
		const drink = await createDrink({ name: `Bier ${round}`, price: 1 });
		await createInventory({
			status: "closed",
			createdAt: daysAgo(20 + round),
			closedAt: daysAgo(10 + round),
			items: [{ drink, countedStock: 10 }],
		});
		await createOrderRow({
			drink,
			amount: 2,
			pricePerUnit: 1.2,
			costPerUnit: 1,
			createdAt: daysAgo(5),
		});
		await createBillRow({
			periodId: period.id,
			user: eventUser(`Gruppe ${round}`),
			items: [{ drinkName: drink.name, amount: 1, pricePerDrink: 1 }],
		});
	}
	return period;
}

async function addFuchsenBills(user: TestUser, n: number) {
	const { period, bills } = await createFuchsenBillPeriod({
		bills: Array.from({ length: n }, () => ({ user, itemsTotal: 1 })),
	});
	for (const bill of bills) {
		await tenantDb().insert(fuchsenBillItems).values({
			billId: bill.id,
			itemName: "Mate",
			amount: 1,
			pricePerItem: 1,
			totalPrice: 1,
		});
	}
	return period;
}

describe("Getränkewart page query budget (#25)", () => {
	test("the page load does not grow with drinks, inventories and bills (was 31 → 71)", async () => {
		await createTenant({ features: ["drinks.markup"] });
		signInAs(await createUser({ roles: ["Getränkewart"] }));
		await createInventory({ createdAt: daysAgo(3) });
		await addHistory(2);
		await loadGetraenkewartPage(); // warm the tenant and feature caches

		const small = await countQueries(loadGetraenkewartPage);
		await addHistory(8);
		const large = await countQueries(loadGetraenkewartPage);

		// 21 data queries (the Kasse summary sums all open bill totals in one
		// query, #139) plus 26 for the 13 guarded loaders' auth() calls. In
		// production auth() is memoized per request (React cache), so the
		// guards cost 2 lookups per page there; the test mock is not memoized.
		expect(small.total).toBe(21 + 26);
		expect(large.total).toBe(small.total);
		expect(large.writes).toBe(0);

		// Items and profits still land on the right inventory.
		const [, , , entityBills, , , stock, history] = large.result;
		expect(entityBills).toHaveLength(10);
		expect(history).toHaveLength(10);
		for (const inv of history) {
			expect(inv.items).toHaveLength(1);
			expect(inv.profit).toBe(0);
		}
		expect(stock).toHaveLength(10);
		expect(stock.map((s) => s.soldSince)).toEqual(Array(10).fill(2));
	});

	test("bill lists do not grow with the number of bills (was 11 → 31)", async () => {
		await createTenant();
		// Reading a whole Fuchsen period is for the Fuchsenwart (the Fuchs role).
		const member = await createUser({ roles: ["Fuchs"] });
		signInAs(member);
		const period = await addHistory(2);
		const fuchsen = await addFuchsenBills(member, 2);

		const small = await countQueries(async () => {
			await getBillsForPeriod(period.id);
			await getFuchsenBillsForPeriod(fuchsen.id);
			await getMyFuchsenBills();
		});
		const bigPeriod = await addHistory(8);
		const bigFuchsen = await addFuchsenBills(member, 8);
		const large = await countQueries(async () => ({
			bills: await getBillsForPeriod(bigPeriod.id),
			fuchsen: await getFuchsenBillsForPeriod(bigFuchsen.id),
			mine: await getMyFuchsenBills(),
		}));

		// Three loaders, one round trip each, plus the session lookup (2), plus
		// each loader's guard (2 each in tests; memoized per request in
		// production).
		expect(small.total).toBe(5 + 6);
		expect(large.total).toBe(small.total);
		expect(large.result.bills).toHaveLength(8);
		expect(large.result.bills.every((b) => b.items.length === 1)).toBe(true);
		expect(large.result.fuchsen).toHaveLength(8);
		expect(large.result.mine).toHaveLength(10);
		expect(
			large.result.mine.every(
				({ bill }) => bill.items.length === 1 && bill.items[0]?.name === "Mate",
			),
		).toBe(true);
	});
});
