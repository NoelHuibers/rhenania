// Characterisation (#58): a quick save that enters only purchases. Reported
// from the dashboard: after a quick save with 4 bottles purchased the header
// showed "Bestandswert 0,00 €" and "Verluste 4,80 €".
//
// The expected-stock and loss maths is not the cause: expected stock is
// opening stock + purchases − sales, and a count below it is a loss. The
// cause is the stored "Ist": the quick save leaves (or, for a drink not yet
// in the running inventory, writes 0 as) the countedStock nobody counted,
// getStockData reports it as `countedStock`, and the dashboard pre-fills
// "Ist" with it instead of the expected stock. The purchases then look
// missing, and a full inventory that keeps the pre-filled values (after
// confirming the uncounted drinks) books them as a real loss.
//
// These tests pin today's behaviour; the fix is decided separately.

import { beforeEach, expect, test, vi } from "vitest";

import { dashboardTotals } from "~/components/inventur/dashboard/dashboard-totals";
import { buildInventoryCount } from "~/components/inventur/inventory-count";
import type { StockStatusWithDetails } from "~/components/inventur/utils";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
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

/** What the dashboard shows and would save, as useInventurDashboard sets it up. */
async function dashboard() {
	// The client's type: the server sends countedStock along, untyped.
	const stock: StockStatusWithDetails[] = await getStockData();
	const purchases: Record<string, number> = {};
	const countedStock: Record<string, number> = {};
	for (const item of stock) {
		countedStock[item.drinkId] = item.countedStock ?? item.calculatedStock;
		if (item.purchasedSince > 0) {
			purchases[item.drinkId] = item.purchasedSince;
		}
	}
	return {
		stock,
		totals: dashboardTotals(stock, purchases, countedStock),
		fullInventory: buildInventoryCount(stock, { countedStock, purchases }),
	};
}

test("purchases of a drink never counted: stored with an Ist of 0, shown and booked as a loss", async () => {
	const mate = await createDrink({ name: "Mate", price: 1.2 });

	// No "Ist" entered: the client sends no count.
	expect(
		await saveQuickAdjustments([{ drinkId: mate.id, purchasedQuantity: 4 }]),
	).toMatchObject({ ok: true });

	const { stock, totals, fullInventory } = await dashboard();
	expect(stock).toEqual([
		expect.objectContaining({
			drinkId: mate.id,
			lastInventoryStock: 0,
			purchasedSince: 4,
			soldSince: 0,
			calculatedStock: 4,
			countedStock: 0,
		}),
	]);
	expect(totals).toMatchObject({
		totalPurchasedUnits: 4,
		totalInventoryValue: 0,
		totalLostValue: 4.8,
	});

	// Saving the full inventory as shown books the purchases as lost.
	const saved = await saveInventoryCount(fullInventory);
	expect(saved).toEqual({ ok: true, data: { totalInventoryLoss: 4.8 } });
});

test("purchases of a counted drink: the old Ist stays, the purchases show as missing", async () => {
	const mate = await createDrink({ name: "Mate", price: 1.2 });
	await saveInventoryCount([
		{ drinkId: mate.id, countedStock: 10, purchasedSince: 0 },
	]);

	expect(
		await saveQuickAdjustments([{ drinkId: mate.id, purchasedQuantity: 4 }]),
	).toMatchObject({ ok: true });

	const { stock, totals, fullInventory } = await dashboard();
	expect(stock).toEqual([
		expect.objectContaining({
			lastInventoryStock: 10,
			purchasedSince: 4,
			calculatedStock: 14,
			countedStock: 10,
		}),
	]);
	expect(totals).toMatchObject({
		totalInventoryValue: 12,
		totalLostValue: 4.8,
	});
	const saved = await saveInventoryCount(fullInventory);
	expect(saved).toEqual({ ok: true, data: { totalInventoryLoss: 4.8 } });
});

test("with the Ist counted, the same purchases are no loss", async () => {
	const mate = await createDrink({ name: "Mate", price: 1.2 });
	expect(
		await saveQuickAdjustments([
			{ drinkId: mate.id, purchasedQuantity: 4, countedStock: 4 },
		]),
	).toMatchObject({ ok: true });

	const { totals, fullInventory } = await dashboard();
	expect(totals).toMatchObject({ totalInventoryValue: 4.8, totalLostValue: 0 });
	const saved = await saveInventoryCount(fullInventory);
	expect(saved).toEqual({ ok: true, data: { totalInventoryLoss: 0 } });
});
