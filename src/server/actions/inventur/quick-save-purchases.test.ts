// A quick save that enters only purchases (#221). Reported from the
// dashboard: after a quick save with 4 bottles purchased the header showed
// "Bestandswert 0,00 €" and "Verluste 4,80 €", and a full inventory saved as
// shown booked the 4,80 € as a loss.
//
// The expected-stock and loss maths was never the cause. The running
// inventory's countedStock was reported as the "Ist" although nobody had
// counted: a purchase-only quick save wrote 0 for a drink not yet in the
// running inventory, or kept the opening count. Now a row only holds a count
// when one was entered (`isCounted`); otherwise the dashboard pre-fills the
// expected stock and lists the drink as uncounted.

import { and, eq } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";

import { dashboardTotals } from "~/components/inventur/dashboard/dashboard-totals";
import {
	buildInventoryCount,
	findUncountedDrinks,
	initialCountState,
} from "~/components/inventur/inventory-count";
import type { StockStatusWithDetails } from "~/components/inventur/utils";
import { inventories, inventoryItems } from "~/server/db/schema";
import { createOrderRow } from "../../../../test/factories/inventory";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	getStockData,
	saveInventoryCount,
	saveQuickAdjustments,
} from "./inventur";

setupTestDatabases();

beforeEach(async () => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	await createTenant();
	signInAs(await createUser({ roles: ["Getränkewart"] }));
});

/** What the dashboard shows and would save, as useInventurDashboard loads it. */
async function dashboard() {
	const stock: StockStatusWithDetails[] = await getStockData();
	const state = initialCountState(stock);
	return {
		stock,
		countedStock: state.countedStock,
		uncounted: findUncountedDrinks(stock, state.countedIds).map(
			(d) => d.drinkName,
		),
		totals: dashboardTotals(stock, state.purchases, state.countedStock),
		fullInventory: buildInventoryCount(stock, state),
	};
}

/** The running inventory's row of a drink. */
async function runningRow(drinkId: string) {
	const [row] = await tenantDb()
		.select({
			countedStock: inventoryItems.countedStock,
			isCounted: inventoryItems.isCounted,
			previousStock: inventoryItems.previousStock,
			purchasedSince: inventoryItems.purchasedSince,
		})
		.from(inventoryItems)
		.innerJoin(inventories, eq(inventoryItems.inventoryId, inventories.id))
		.where(
			and(
				eq(inventories.status, "active"),
				eq(inventoryItems.drinkId, drinkId),
			),
		);
	return row;
}

test("purchases of a drink never counted: no count stored, no loss shown or booked", async () => {
	const mate = await createDrink({ name: "Mate", price: 1.2 });

	// No "Ist" entered: the client sends no count.
	expect(
		await saveQuickAdjustments([{ drinkId: mate.id, purchasedQuantity: 4 }]),
	).toMatchObject({ ok: true });

	expect(await runningRow(mate.id)).toMatchObject({
		isCounted: false,
		purchasedSince: 4,
	});
	const { stock, countedStock, uncounted, totals, fullInventory } =
		await dashboard();
	expect(stock).toEqual([
		expect.objectContaining({
			drinkId: mate.id,
			lastInventoryStock: 0,
			purchasedSince: 4,
			soldSince: 0,
			calculatedStock: 4,
			countedStock: undefined,
		}),
	]);
	// The "Ist" is the expected stock, and the drink still needs counting.
	expect(countedStock).toEqual({ [mate.id]: 4 });
	expect(uncounted).toEqual(["Mate"]);
	expect(totals).toMatchObject({
		totalPurchasedUnits: 4,
		totalInventoryValue: 4.8,
		totalLostValue: 0,
	});

	// A full inventory saved as shown books no loss.
	const saved = await saveInventoryCount(fullInventory);
	expect(saved).toEqual({ ok: true, data: { totalInventoryLoss: 0 } });
	// The purchases are the next inventory's opening stock.
	expect(await runningRow(mate.id)).toMatchObject({
		previousStock: 4,
		isCounted: false,
	});
});

test("purchases of a counted drink: the expected stock is shown, not the opening count", async () => {
	const mate = await createDrink({ name: "Mate", price: 1.2 });
	await saveInventoryCount([
		{ drinkId: mate.id, countedStock: 10, purchasedSince: 0 },
	]);

	expect(
		await saveQuickAdjustments([{ drinkId: mate.id, purchasedQuantity: 4 }]),
	).toMatchObject({ ok: true });

	// The opening count stays as the row's opening stock, not as a count.
	expect(await runningRow(mate.id)).toEqual({
		countedStock: 10,
		isCounted: false,
		previousStock: 10,
		purchasedSince: 4,
	});
	const { stock, countedStock, uncounted, totals, fullInventory } =
		await dashboard();
	expect(stock).toEqual([
		expect.objectContaining({
			lastInventoryStock: 10,
			purchasedSince: 4,
			calculatedStock: 14,
			countedStock: undefined,
		}),
	]);
	expect(countedStock).toEqual({ [mate.id]: 14 });
	expect(uncounted).toEqual(["Mate"]);
	expect(totals).toMatchObject({
		totalInventoryValue: 16.8,
		totalLostValue: 0,
	});
	const saved = await saveInventoryCount(fullInventory);
	expect(saved).toEqual({ ok: true, data: { totalInventoryLoss: 0 } });
});

test("sales since the count lower the pre-filled Ist instead of hiding as a surplus", async () => {
	const mate = await createDrink({ name: "Mate", price: 1.2 });
	await saveInventoryCount([
		{ drinkId: mate.id, countedStock: 10, purchasedSince: 0 },
	]);
	await createOrderRow({ drink: mate, amount: 3 });
	await saveQuickAdjustments([{ drinkId: mate.id, purchasedQuantity: 4 }]);

	const { countedStock, totals, fullInventory } = await dashboard();
	expect(countedStock).toEqual({ [mate.id]: 11 });
	expect(totals).toMatchObject({ totalSoldUnits: 3, totalLostValue: 0 });
	expect(await saveInventoryCount(fullInventory)).toEqual({
		ok: true,
		data: { totalInventoryLoss: 0 },
	});
	expect(await runningRow(mate.id)).toMatchObject({ previousStock: 11 });
});

test("a quick-saved Ist is a count: shown, not listed as uncounted, and booked", async () => {
	const mate = await createDrink({ name: "Mate", price: 1.2 });
	const cola = await createDrink({ name: "Cola", price: 1 });
	expect(
		await saveQuickAdjustments([
			{ drinkId: mate.id, purchasedQuantity: 4, countedStock: 3 },
			{ drinkId: cola.id, purchasedQuantity: 2 },
		]),
	).toMatchObject({ ok: true });
	// A later purchase-only quick save keeps the count.
	await saveQuickAdjustments([{ drinkId: mate.id, purchasedQuantity: 5 }]);

	expect(await runningRow(mate.id)).toMatchObject({
		countedStock: 3,
		isCounted: true,
		purchasedSince: 5,
	});
	const { stock, countedStock, uncounted, totals, fullInventory } =
		await dashboard();
	expect(stock.find((s) => s.drinkId === mate.id)).toMatchObject({
		calculatedStock: 5,
		countedStock: 3,
	});
	expect(countedStock).toEqual({ [mate.id]: 3, [cola.id]: 2 });
	expect(uncounted).toEqual(["Cola"]);
	// 2 Mate missing at 1.20 €.
	expect(totals).toMatchObject({
		totalInventoryValue: expect.closeTo(5.6),
		totalLostValue: expect.closeTo(2.4),
	});
	const saved = await saveInventoryCount(fullInventory);
	expect(saved).toEqual({ ok: true, data: { totalInventoryLoss: 2.4 } });
});

test("a quick save with the Ist counted as expected is no loss", async () => {
	const mate = await createDrink({ name: "Mate", price: 1.2 });
	expect(
		await saveQuickAdjustments([
			{ drinkId: mate.id, purchasedQuantity: 4, countedStock: 4 },
		]),
	).toMatchObject({ ok: true });

	const { uncounted, totals, fullInventory } = await dashboard();
	expect(uncounted).toEqual([]);
	expect(totals).toMatchObject({ totalInventoryValue: 4.8, totalLostValue: 0 });
	const saved = await saveInventoryCount(fullInventory);
	expect(saved).toEqual({ ok: true, data: { totalInventoryLoss: 0 } });
});

test("a closed inventory's rows are counts, the next one's opening rows are not", async () => {
	const mate = await createDrink({ name: "Mate", price: 1.2 });
	await saveInventoryCount([
		{ drinkId: mate.id, countedStock: 6, purchasedSince: 0 },
	]);
	await saveInventoryCount([
		{ drinkId: mate.id, countedStock: 5, purchasedSince: 0 },
	]);

	const rows = await tenantDb()
		.select({
			status: inventories.status,
			countedStock: inventoryItems.countedStock,
			isCounted: inventoryItems.isCounted,
		})
		.from(inventoryItems)
		.innerJoin(inventories, eq(inventoryItems.inventoryId, inventories.id))
		.orderBy(inventories.status);
	expect(rows).toEqual([
		{ status: "active", countedStock: 5, isCounted: false },
		{ status: "closed", countedStock: 5, isCounted: true },
	]);
});
