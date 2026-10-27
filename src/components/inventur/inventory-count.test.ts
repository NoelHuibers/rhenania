import { describe, expect, test } from "vitest";
import {
	buildInventoryCount,
	buildQuickAdjustments,
	expectedWithPurchases,
	findUncountedDrinks,
	hasUnsavedChange,
	initialCountState,
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

describe("initialCountState (#221)", () => {
	const loaded = [
		// Purchases saved without a count.
		{
			drinkId: "mate",
			drinkName: "Mate",
			lastInventoryStock: 0,
			purchasedSince: 4,
			soldSince: 0,
			calculatedStock: 4,
		},
		// Counted in an earlier quick save.
		{
			drinkId: "pils",
			drinkName: "Pils",
			lastInventoryStock: 20,
			purchasedSince: 0,
			soldSince: 2,
			calculatedStock: 18,
			countedStock: 15,
		},
	];

	test("pre-fills uncounted drinks with the expected stock, counted ones with their count", () => {
		const state = initialCountState(loaded);
		expect(state.countedStock).toEqual({ mate: 4, pils: 15 });
		expect(state.purchases).toEqual({ mate: 4 });
		expect([...state.countedIds]).toEqual(["pils"]);
		expect(
			findUncountedDrinks(loaded, state.countedIds).map((d) => d.drinkId),
		).toEqual(["mate"]);
	});
});

describe("expectedWithPurchases", () => {
	test("is the opening stock plus the entered purchases minus sales, never negative", () => {
		const item = { lastInventoryStock: 10, soldSince: 3 };
		expect(expectedWithPurchases(item, 4)).toBe(11);
		expect(expectedWithPurchases(item, 6)).toBe(13);
		expect(
			expectedWithPurchases({ lastInventoryStock: 1, soldSince: 3 }, 0),
		).toBe(0);
	});
});

describe("hasUnsavedChange", () => {
	const saved = { purchasedSince: 4, countedStock: undefined };

	test("a changed purchase is a change, the pre-filled Ist of an uncounted drink is not", () => {
		expect(
			hasUnsavedChange(saved, { purchase: 6, count: 13, counted: false }),
		).toBe(true);
		expect(
			hasUnsavedChange(saved, { purchase: 4, count: 99, counted: false }),
		).toBe(false);
	});

	test("an entered Ist is a change until it matches the saved count", () => {
		// Even a count equal to the expected stock is saved, as counted.
		expect(
			hasUnsavedChange(saved, { purchase: 4, count: 4, counted: true }),
		).toBe(true);
		const counted = { purchasedSince: 4, countedStock: 3 };
		expect(
			hasUnsavedChange(counted, { purchase: 4, count: 3, counted: true }),
		).toBe(false);
		expect(
			hasUnsavedChange(counted, { purchase: 4, count: 2, counted: true }),
		).toBe(true);
	});
});
