import { describe, expect, test } from "vitest";
import {
	addMoney,
	allocate,
	fromCents,
	pctOf,
	roundToCent,
	shareDown,
	sumMoney,
	toCents,
} from "./money";

/** Deterministic PRNG (mulberry32) so property runs are reproducible. */
function prng(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const random = prng(13);
const randomInt = (min: number, max: number) =>
	min + Math.floor(random() * (max - min + 1));

/** True when `euros` is exactly the double a whole number of cents maps to. */
const isWholeCents = (euros: number) => euros === Math.round(euros * 100) / 100;

describe("roundToCent", () => {
	test("rounds half away from zero, ignoring float noise", () => {
		expect(roundToCent(0.759)).toBe(0.76);
		expect(roundToCent(1.005)).toBe(1.01);
		expect(roundToCent(0.7245)).toBe(0.72);
		expect(roundToCent(0.505)).toBe(0.51);
		expect(roundToCent(2.675)).toBe(2.68);
		expect(roundToCent(0.1 + 0.2)).toBe(0.3);
		expect(roundToCent(-1.005)).toBe(-1.01);
		expect(roundToCent(-0.004)).toBe(0);
		expect(Object.is(roundToCent(-0.004), 0)).toBe(true);
	});

	test("rejects non-finite amounts", () => {
		expect(() => roundToCent(Number.NaN)).toThrow(RangeError);
		expect(() => roundToCent(Number.POSITIVE_INFINITY)).toThrow(RangeError);
	});

	test("every whole-cent amount survives unchanged and every x.5 cent rounds up", () => {
		for (let cents = -100_000; cents <= 100_000; cents++) {
			const euros = cents / 100;
			expect(roundToCent(euros)).toBe(euros);
			// The exact half cent, as typed: "12.345" → 12.35.
			const half = Number(`${(Math.abs(cents) / 100).toFixed(2)}5`);
			expect(toCents(half)).toBe(Math.abs(cents) + 1);
		}
	});

	test("is idempotent and never moves more than half a cent", () => {
		for (let i = 0; i < 20_000; i++) {
			const euros = (random() - 0.5) * 20_000;
			const rounded = roundToCent(euros);
			expect(roundToCent(rounded)).toBe(rounded);
			expect(isWholeCents(rounded)).toBe(true);
			expect(Math.abs(rounded - euros)).toBeLessThanOrEqual(0.005 + 1e-9);
		}
	});
});

describe("toCents / fromCents", () => {
	test("round-trip every whole-cent amount", () => {
		for (let cents = -100_000; cents <= 100_000; cents++) {
			expect(toCents(fromCents(cents))).toBe(cents);
		}
	});

	test("fromCents only accepts whole cents", () => {
		expect(() => fromCents(1.5)).toThrow(RangeError);
	});
});

describe("sumMoney / addMoney", () => {
	test("adds in whole cents without floating-point residue", () => {
		expect(sumMoney([0.1, 0.2])).toBe(0.3);
		expect(sumMoney([1.1, 1.1, 1.1])).toBe(3.3);
		expect(sumMoney([])).toBe(0);
		expect(addMoney(0.1, 0.2)).toBe(0.3);
		expect(addMoney(5.05, -5.05)).toBe(0);
	});

	test("equals the integer sum of the rounded parts", () => {
		for (let run = 0; run < 2_000; run++) {
			const parts = Array.from({ length: randomInt(1, 12) }, () =>
				fromCents(randomInt(-50_000, 50_000)),
			);
			const expected = parts.reduce((s, p) => s + Math.round(p * 100), 0);
			const total = sumMoney(parts);
			expect(isWholeCents(total)).toBe(true);
			expect(toCents(total)).toBe(expected);
			expect(parts.reduce((acc, p) => addMoney(acc, p), 0)).toBe(total);
		}
	});
});

describe("pctOf", () => {
	test("rounds the percentage half up to whole cents", () => {
		// The 10 % late fee on 5.05 € is 0.505 € → 0.51 €.
		expect(pctOf(5.05, 10)).toBe(0.51);
		expect(pctOf(7.77, 10)).toBe(0.78);
		expect(pctOf(1.9, 15)).toBe(0.29);
		expect(pctOf(0.67, 12.5)).toBe(0.08);
		expect(pctOf(20, 10)).toBe(2);
		expect(pctOf(-5.05, 10)).toBe(-0.51);
		expect(pctOf(123.45, 0)).toBe(0);
		expect(() => pctOf(1, Number.NaN)).toThrow(RangeError);
	});

	test("matches exact integer half-up rounding for half-percent rates", () => {
		for (let twicePercent = 0; twicePercent <= 200; twicePercent += 5) {
			for (let cents = 0; cents <= 20_000; cents += 7) {
				// cents × p / 100 with p = twicePercent / 2, half up in BigInt.
				const numerator = BigInt(cents * twicePercent);
				const expected = Number((numerator + 100n) / 200n);
				expect(toCents(pctOf(fromCents(cents), twicePercent / 2))).toBe(
					expected,
				);
			}
		}
	});
});

describe("allocate", () => {
	test("splits into whole cents that add up exactly, largest remainder first", () => {
		expect(allocate(1000, 3)).toEqual([334, 333, 333]);
		expect(allocate(5000, 3)).toEqual([1667, 1667, 1666]);
		expect(allocate(100, 4)).toEqual([25, 25, 25, 25]);
		expect(allocate(2, 5)).toEqual([1, 1, 0, 0, 0]);
		expect(allocate(-5000, 3)).toEqual([-1667, -1667, -1666]);
		expect(allocate(0, 2)).toEqual([0, 0]);
		expect(Object.is(allocate(-1, 2)[1], 0)).toBe(true);
	});

	test("rejects fractional cents and empty splits", () => {
		expect(() => allocate(10.5, 2)).toThrow(RangeError);
		expect(() => allocate(10, 0)).toThrow(RangeError);
		expect(() => allocate(10, 1.5)).toThrow(RangeError);
	});

	test("parts sum to the amount and differ by at most one cent", () => {
		for (let run = 0; run < 5_000; run++) {
			const cents = randomInt(-1_000_000, 1_000_000);
			const n = randomInt(1, 60);
			const parts = allocate(cents, n);
			expect(parts).toHaveLength(n);
			expect(parts.reduce((a, b) => a + b, 0)).toBe(cents);
			expect(parts.every(Number.isInteger)).toBe(true);
			const abs = parts.map(Math.abs);
			expect(Math.max(...abs) - Math.min(...abs)).toBeLessThanOrEqual(1);
			// Non-increasing in magnitude: the extra cents go to the first parts.
			for (let i = 1; i < abs.length; i++) {
				expect(abs[i]).toBeLessThanOrEqual(abs[i - 1] ?? 0);
			}
		}
	});
});

describe("shareDown", () => {
	test("gives every part the same whole cents, rounded down", () => {
		expect(shareDown(12_000, 6)).toBe(2000);
		expect(shareDown(10_000, 3)).toBe(3333);
		expect(shareDown(2, 3)).toBe(0);
		expect(shareDown(0, 4)).toBe(0);
	});

	test("rejects fractional or negative cents and empty splits", () => {
		expect(() => shareDown(10.5, 2)).toThrow(RangeError);
		expect(() => shareDown(-10, 2)).toThrow(RangeError);
		expect(() => shareDown(10, 0)).toThrow(RangeError);
		expect(() => shareDown(10, 1.5)).toThrow(RangeError);
	});

	test("the parts never exceed the amount and miss it by less than a cent each", () => {
		for (let run = 0; run < 5_000; run++) {
			const cents = randomInt(0, 1_000_000);
			const n = randomInt(1, 60);
			const charged = shareDown(cents, n) * n;
			expect(charged).toBeLessThanOrEqual(cents);
			expect(cents - charged).toBeLessThan(n);
		}
	});
});
