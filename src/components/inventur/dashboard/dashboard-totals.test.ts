import { expect, test } from "vitest";
import { dashboardTotals } from "./dashboard-totals";

const pils = {
	drinkId: "pils",
	lastInventoryStock: 20,
	soldSince: 5,
	calculatedStock: 15,
	currentPrice: 1.5,
};
const cola = {
	drinkId: "cola",
	lastInventoryStock: 4,
	soldSince: 2,
	calculatedStock: 2,
	currentPrice: 1,
};

test("nothing entered: expected stock, no purchases, no losses", () => {
	expect(dashboardTotals([pils, cola], {}, {})).toEqual({
		totalSoldUnits: 7,
		totalPurchasedUnits: 0,
		totalLostValue: 0,
		totalInventoryValue: 15 * 1.5 + 2 * 1,
	});
});

test("purchases raise the expected stock the loss is measured against", () => {
	// Pils: 20 + 12 - 5 = 27 expected, 25 counted -> 2 lost at 1.50.
	expect(dashboardTotals([pils, cola], { pils: 12 }, { pils: 25 })).toEqual({
		totalSoldUnits: 7,
		totalPurchasedUnits: 12,
		totalLostValue: 3,
		totalInventoryValue: 25 * 1.5 + 2 * 1,
	});
});

test("a surplus is no negative loss, and a count of 0 is a count", () => {
	const totals = dashboardTotals([pils, cola], {}, { pils: 18, cola: 0 });
	expect(totals.totalLostValue).toBe(2);
	expect(totals.totalInventoryValue).toBe(18 * 1.5);
});

test("an empty stock list sums to zero", () => {
	expect(dashboardTotals([], {}, {})).toEqual({
		totalSoldUnits: 0,
		totalPurchasedUnits: 0,
		totalLostValue: 0,
		totalInventoryValue: 0,
	});
});
