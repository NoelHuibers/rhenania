import { expect, test } from "vitest";
import { formatEur } from "./cc-kasse-format";

test.each([
	[1234.5, "1.234,50 €"],
	[-12.3, "-12,30 €"],
	[0, "0,00 €"],
	[0.005, "0,01 €"],
	[1_000_000, "1.000.000,00 €"],
])("formats %s as %s", (n, expected) => {
	// Intl puts a non-breaking space before the euro sign.
	expect(formatEur(n).replace(/\s/g, " ")).toBe(expected);
});

test("non-finite numbers render as zero instead of NaN €", () => {
	for (const n of [Number.NaN, Number.POSITIVE_INFINITY, -Infinity]) {
		expect(formatEur(n).replace(/\s/g, " ")).toBe("0,00 €");
	}
});
