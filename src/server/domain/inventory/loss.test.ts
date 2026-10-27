import { describe, expect, test } from "vitest";

import { expectedStock, itemLoss } from "./loss";

const movement = { previousStock: 10, purchasedSince: 4, soldSince: 6 };

describe("expectedStock", () => {
	test("is the opening stock plus purchases minus sales", () => {
		expect(expectedStock(movement)).toBe(8);
		expect(
			expectedStock({ previousStock: 0, purchasedSince: 4, soldSince: 0 }),
		).toBe(4);
	});

	test("is clamped at 0 when more was sold than was there", () => {
		expect(
			expectedStock({ previousStock: 2, purchasedSince: 0, soldSince: 5 }),
		).toBe(0);
	});
});

describe("itemLoss", () => {
	test("is 0 when the count is at or above the expected stock", () => {
		expect(itemLoss({ ...movement, counted: 8, price: 1.2 })).toEqual({
			missing: 0,
			value: 0,
		});
		expect(itemLoss({ ...movement, counted: 12, price: 1.2 })).toEqual({
			missing: 0,
			value: 0,
		});
	});

	test("values the missing units at the price, rounded to whole cents", () => {
		expect(itemLoss({ ...movement, counted: 5, price: 1.2 })).toEqual({
			missing: 3,
			value: 3.6,
		});
		// 3 × 0.335 = 1.005 → 1.01 (half up, without float noise).
		expect(itemLoss({ ...movement, counted: 5, price: 0.335 })).toEqual({
			missing: 3,
			value: 1.01,
		});
	});

	test("measures against the clamped expected stock", () => {
		expect(
			itemLoss({
				previousStock: 2,
				purchasedSince: 0,
				soldSince: 5,
				counted: 0,
				price: 1.5,
			}),
		).toEqual({ missing: 0, value: 0 });
	});

	test("purchases nobody counted count as missing (see quick-save-purchases.test.ts)", () => {
		expect(
			itemLoss({
				previousStock: 0,
				purchasedSince: 4,
				soldSince: 0,
				counted: 0,
				price: 1.2,
			}),
		).toEqual({ missing: 4, value: 4.8 });
	});
});
