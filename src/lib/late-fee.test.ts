import { describe, expect, test } from "vitest";

import { LATE_FEE, lateFeeFor, lateFeeSentence } from "./late-fee";

describe("lateFeeFor", () => {
	test("charges 10% of the carried-over amount above 5 €", () => {
		expect(LATE_FEE).toEqual({ percent: 10, threshold: 5 });
		expect(lateFeeFor(20, false)).toBe(2);
		expect(lateFeeFor(12.35, false)).toBe(1.24);
	});

	test("charges nothing up to the threshold or for deferred bills", () => {
		expect(lateFeeFor(5, false)).toBe(0);
		expect(lateFeeFor(0, false)).toBe(0);
		expect(lateFeeFor(50, true)).toBe(0);
	});
});

test("the letter states the same rule (#11)", () => {
	expect(lateFeeSentence()).toBe(
		"Bleiben mehr als 5€ offen, gibt es eine Mahnung in Höhe von 10% davon auf die nächste",
	);
});
