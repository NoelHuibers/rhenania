// money.ts — the one place that rounds euro amounts.
//
// Money columns are still REAL (floating point) euros; moving them to integer
// cents is a separate decision. Until then every amount is rounded to whole
// cents here before it is written, and sums are taken in integer cents so
// that line items always add up to the stored total.
//
// Rounding is half away from zero ("kaufmännisch"): 0.005 → 0.01 and
// -0.005 → -0.01. Float noise from earlier arithmetic is removed first, so
// 1.005 (stored as 1.00499999…) still rounds up as written.

/** Significant digits kept when cleaning float noise before rounding. */
const NOISE_FREE_DIGITS = 15;

/** Rounds a value to an integer, half away from zero, ignoring float noise. */
function roundHalfAwayFromZero(value: number): number {
	if (!Number.isFinite(value)) {
		throw new RangeError(`Not a finite amount: ${value}`);
	}
	// 100.49999999999999 (from 1.005 * 100) becomes 100.5 again.
	const clean = Number(value.toPrecision(NOISE_FREE_DIGITS));
	const rounded = Math.sign(clean) * Math.round(Math.abs(clean));
	// Normalise -0 so callers never see it in comparisons or output.
	return rounded === 0 ? 0 : rounded;
}

/** Euros → whole cents, half away from zero. */
export function toCents(euros: number): number {
	return roundHalfAwayFromZero(euros * 100);
}

/** Whole cents → euros. Exact for every integer number of cents. */
export function fromCents(cents: number): number {
	if (!Number.isSafeInteger(cents)) {
		throw new RangeError(`Not a whole number of cents: ${cents}`);
	}
	return cents / 100;
}

/** Rounds a euro amount to whole cents, half away from zero. */
export function roundToCent(euros: number): number {
	return fromCents(toCents(euros));
}

/** Sum of euro amounts, each rounded to cents and added in integer cents. */
export function sumMoney(amounts: Iterable<number>): number {
	let cents = 0;
	for (const amount of amounts) {
		cents += toCents(amount);
	}
	return fromCents(cents);
}

/** `a + b` in whole cents. */
export function addMoney(a: number, b: number): number {
	return fromCents(toCents(a) + toCents(b));
}

/**
 * `percent` % of `euros`, rounded half away from zero to whole cents.
 * The base is rounded to cents first, so pctOf(5.05, 10) is 0.51.
 */
export function pctOf(euros: number, percent: number): number {
	if (!Number.isFinite(percent)) {
		throw new RangeError(`Not a finite percentage: ${percent}`);
	}
	return fromCents(roundHalfAwayFromZero((toCents(euros) * percent) / 100));
}

/**
 * The equal whole-cent share of `cents` for each of `n` parts, rounded down.
 * The `n` shares add up to at most `cents` and fall short of it by less than
 * one cent per part. Use it where the remainder must not be charged to
 * anybody (unlike `allocate`, which hands it out).
 */
export function shareDown(cents: number, n: number): number {
	if (!Number.isSafeInteger(cents) || cents < 0) {
		throw new RangeError(`Not a non-negative number of cents: ${cents}`);
	}
	if (!Number.isSafeInteger(n) || n < 1) {
		throw new RangeError(`Cannot split into ${n} parts`);
	}
	return Math.floor(cents / n);
}

/**
 * Splits `cents` into `n` whole-cent parts that add up exactly to `cents`
 * (largest remainder method with equal weights): every part gets the floor
 * share and the leftover cents go one each to the first parts. Negative
 * amounts are split symmetrically.
 */
export function allocate(cents: number, n: number): number[] {
	if (!Number.isSafeInteger(cents)) {
		throw new RangeError(`Not a whole number of cents: ${cents}`);
	}
	if (!Number.isSafeInteger(n) || n < 1) {
		throw new RangeError(`Cannot split into ${n} parts`);
	}
	const sign = cents < 0 ? -1 : 1;
	const total = Math.abs(cents);
	const share = Math.floor(total / n);
	const leftover = total - share * n;
	return Array.from({ length: n }, (_, i) => {
		const part = sign * (share + (i < leftover ? 1 : 0));
		return part === 0 ? 0 : part;
	});
}
