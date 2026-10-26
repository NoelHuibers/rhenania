import assert from "node:assert/strict";
import { describe, expect, test } from "vitest";
import {
	applyMarkup,
	isValidMarkupPercent,
	MAX_MARKUP_PERCENT,
	orderTotal,
	unitPriceFor,
} from "./pricing";

test("adds the markup and rounds per unit", () => {
	assert.equal(applyMarkup(0.69, 10), 0.76);
	assert.equal(applyMarkup(1, 15), 1.15);
	assert.equal(applyMarkup(0.67, 12.5), 0.75);
});

test("no markup leaves the price untouched", () => {
	assert.equal(applyMarkup(0.69, 0), 0.69);
});

test("an invalid markup is ignored", () => {
	assert.equal(applyMarkup(0.69, -5), 0.69);
	assert.equal(applyMarkup(0.69, Number.NaN), 0.69);
	assert.equal(isValidMarkupPercent(501), false);
	assert.equal(isValidMarkupPercent(20), true);
});

test("group bookings never carry a markup", () => {
	assert.equal(unitPriceFor(0.69, 10, "CC"), 0.69);
	assert.equal(unitPriceFor(0.69, 10, null), 0.76);
});

test("order totals are whole cents, with or without markup (#13)", () => {
	assert.equal(orderTotal(0.76, 3, 10), 2.28);
	// 0.69 × 3 is 2.0699999999999998 and 0.1 × 3 is 0.30000000000000004 in
	// floating point; stored totals are whole cents.
	assert.equal(orderTotal(0.69, 3, 0), 2.07);
	assert.equal(orderTotal(0.1, 3, 0), 0.3);
});

describe("pricing properties", () => {
	const MARKUPS = [5, 10, 12.5, 15, 20, 25, 30, 50, 100, MAX_MARKUP_PERCENT];
	const isWholeCents = (euros: number) =>
		Math.abs(euros * 100 - Math.round(euros * 100)) < 1e-6;

	test("marked-up prices are whole cents within half a cent of the exact value", () => {
		for (const markup of MARKUPS) {
			let previous = 0;
			for (let cents = 1; cents <= 10_000; cents++) {
				const price = applyMarkup(cents / 100, markup);
				const exactCents = (cents * (100 + markup)) / 100;
				expect(isWholeCents(price)).toBe(true);
				expect(Math.abs(price * 100 - exactCents)).toBeLessThanOrEqual(
					0.5 + 1e-9,
				);
				// Never cheaper than the purchase price, and monotonic.
				expect(price).toBeGreaterThanOrEqual(cents / 100);
				expect(price).toBeGreaterThanOrEqual(previous);
				previous = price;
			}
		}
	});

	test("group bookings pay the purchase price for any markup", () => {
		for (const markup of MARKUPS) {
			for (const bookingFor of ["CC", "AHV", "AKN"]) {
				expect(unitPriceFor(1.37, markup, bookingFor)).toBe(1.37);
			}
			expect(unitPriceFor(1.37, markup, "")).toBe(applyMarkup(1.37, markup));
			expect(unitPriceFor(1.37, markup, undefined)).toBe(
				applyMarkup(1.37, markup),
			);
		}
	});

	test("order totals with markup are whole cents", () => {
		for (let cents = 1; cents <= 500; cents++) {
			for (const amount of [1, 2, 3, 7, 24]) {
				const unit = applyMarkup(cents / 100, 15);
				expect(isWholeCents(orderTotal(unit, amount, 15))).toBe(true);
			}
		}
	});

	test("markups outside 0–500 % are ignored", () => {
		expect(isValidMarkupPercent(0)).toBe(true);
		expect(isValidMarkupPercent(MAX_MARKUP_PERCENT)).toBe(true);
		expect(isValidMarkupPercent(Number.POSITIVE_INFINITY)).toBe(false);
		expect(applyMarkup(2, MAX_MARKUP_PERCENT + 1)).toBe(2);
	});

	// 1.9 × 1.15 = 2.1849999999999996 in floating point; computed in cents
	// it is exactly 218.5 and rounds up.
	test("applyMarkup(1.90, 15) rounds the half cent up to 2.19 (#14)", () => {
		expect(applyMarkup(1.9, 15)).toBe(2.19);
	});

	// Exhaustive check against integer half-up rounding.
	test("matches exact half-up rounding for all prices and half-percent markups (#14)", () => {
		const mismatches: string[] = [];
		for (let twiceMarkup = 0; twiceMarkup <= 100; twiceMarkup++) {
			const markup = twiceMarkup / 2;
			for (let cents = 1; cents <= 10_000; cents++) {
				// cents × (200 + 2m) / 200, rounded half up in integers.
				const numerator = BigInt(cents * (200 + twiceMarkup));
				const expected = Number((2n * numerator + 200n) / 400n);
				const actual = Math.round(applyMarkup(cents / 100, markup) * 100);
				if (actual !== expected) {
					mismatches.push(`${cents / 100}@${markup}%`);
				}
			}
		}
		expect(mismatches).toEqual([]);
	});
});
