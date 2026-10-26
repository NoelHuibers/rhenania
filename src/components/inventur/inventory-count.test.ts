import { describe, expect, test } from "vitest";
import {
	buildInventoryCount,
	buildQuickAdjustments,
	findUncountedDrinks,
	isBlockedByUncounted,
} from "./inventory-count";

const stock = [
	{
		drinkId: "pils",
		drinkName: "Pils",
		calculatedStock: 18,
		purchasedSince: 0,
	},
	{
		drinkId: "cola",
		drinkName: "Cola",
		calculatedStock: 6,
		purchasedSince: 12,
	},
	{ drinkId: "mate", drinkName: "Mate", calculatedStock: 4, purchasedSince: 0 },
];

describe("buildInventoryCount", () => {
	test("sends every drink with its shown Ist and purchases", () => {
		expect(
			buildInventoryCount(stock, {
				countedStock: { pils: 15, cola: 7 },
				purchases: { cola: 12 },
			}),
		).toEqual([
			{ drinkId: "pils", countedStock: 15, purchasedSince: 0 },
			{ drinkId: "cola", countedStock: 7, purchasedSince: 12 },
			{ drinkId: "mate", countedStock: 4, purchasedSince: 0 },
		]);
	});
});

describe("findUncountedDrinks", () => {
	test("lists the drinks whose Ist was never entered (#19)", () => {
		expect(
			findUncountedDrinks(stock, new Set(["cola"])).map((d) => d.drinkName),
		).toEqual(["Pils", "Mate"]);
		expect(
			findUncountedDrinks(stock, new Set(["pils", "cola", "mate"])),
		).toEqual([]);
	});
});

describe("isBlockedByUncounted", () => {
	test("blocks a full inventory with uncounted drinks until confirmed (#19)", () => {
		expect(isBlockedByUncounted(stock, false)).toBe(true);
		expect(isBlockedByUncounted(stock, true)).toBe(false);
		expect(isBlockedByUncounted([], false)).toBe(false);
	});
});

describe("buildQuickAdjustments", () => {
	const countedStock = { pils: 15, cola: 18, mate: 4 };

	test("sends a count only for counted drinks (#19)", () => {
		expect(
			buildQuickAdjustments(["pils", "cola", "mate"], stock, {
				countedStock,
				purchases: { cola: 24 },
				countedIds: new Set(["pils"]),
			}),
		).toEqual([
			{ drinkId: "pils", countedStock: 15, purchasedQuantity: undefined },
			// Only the purchase changed: the pre-filled Ist stays unsaved.
			{ drinkId: "cola", countedStock: undefined, purchasedQuantity: 24 },
		]);
	});

	test("sends a purchase reset to 0 and skips unknown drinks without changes", () => {
		expect(
			buildQuickAdjustments(["cola", "gone"], stock, {
				countedStock,
				purchases: {},
				countedIds: new Set(),
			}),
		).toEqual([
			{ drinkId: "cola", countedStock: undefined, purchasedQuantity: 0 },
		]);
	});
});
