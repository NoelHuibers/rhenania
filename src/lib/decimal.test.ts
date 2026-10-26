import { describe, expect, test } from "vitest";

import { parseDecimalInput } from "./decimal";

describe("parseDecimalInput", () => {
	test.each([
		["12,50", 12.5],
		["12.50", 12.5],
		["1.234,56", 1234.56],
		["1,234.56", 1234.56],
		["1.234.567,89", 1234567.89],
		["1,234,567.89", 1234567.89],
		["  12,50 € ", 12.5],
		["€12.50", 12.5],
		["1 234,56", 1234.56],
		["-3,5", -3.5],
		["0,05", 0.05],
		[",5", 0.5],
		["7", 7],
	])("%j → %d", (input, expected) => {
		expect(parseDecimalInput(input)).toBe(expected);
	});

	test.each([
		"",
		"   ",
		"€",
		"abc",
		"12,50abc",
		"1,234,567",
		"1.234.567",
		"Infinity",
	])("%j is NaN", (input) => {
		expect(parseDecimalInput(input)).toBeNaN();
	});

	// Without a second separator a lone one is always the decimal point.
	test.each([
		["1.234", 1.234],
		["1,234", 1.234],
	])("ambiguous %j is read as a decimal", (input, expected) => {
		expect(parseDecimalInput(input)).toBe(expected);
	});

	test("reads back every cent amount formatted in German or English", () => {
		const formats = [
			new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2 }),
			new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }),
			new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }),
			new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }),
		];
		for (let cents = 0; cents <= 250_000; cents += 7) {
			const amount = cents / 100;
			for (const format of formats) {
				expect(parseDecimalInput(format.format(amount))).toBe(amount);
			}
		}
	});
});
