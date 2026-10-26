// Bill numbers must not depend on the server time zone; besides the CI
// matrix (TZ=Europe/Berlin and TZ=UTC) every case is run under several
// process time zones.

import { afterEach, describe, expect, test } from "vitest";

import { billNumberBase, nextBillNumber } from "./bill-number";

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
	process.env.TZ = ORIGINAL_TZ;
});

const SERVER_TZS = [
	"Europe/Berlin",
	"UTC",
	"America/Los_Angeles",
	"Pacific/Auckland",
];

describe("billNumberBase", () => {
	test.each([
		// Monday 30 Dec 2024 is ISO week 1 of 2025.
		["2024-12-30T12:00:00Z", "KW-01-25"],
		["2025-12-29T12:00:00Z", "KW-01-26"],
		// Friday 1 Jan 2027 is ISO week 53 of 2026.
		["2027-01-01T12:00:00Z", "KW-53-26"],
		// Sunday 3 Jan 2021 is still week 53 of 2020.
		["2021-01-03T12:00:00Z", "KW-53-20"],
		["2026-01-01T12:00:00Z", "KW-01-26"],
		// Monday 26 Oct 2026 00:30 Berlin is Sunday 23:30 UTC.
		["2026-10-25T23:30:00Z", "KW-44-26"],
		// Sunday 25 Oct 2026 23:30 Berlin is still week 43.
		["2026-10-25T22:30:00Z", "KW-43-26"],
		// Monday 1 Jan 2029 00:30 Berlin is still 2028 in UTC.
		["2028-12-31T23:30:00Z", "KW-01-29"],
		["2026-06-15T08:00:00Z", "KW-25-26"],
	])("%s is %s", (iso, expected) => {
		for (const tz of SERVER_TZS) {
			process.env.TZ = tz;
			expect(billNumberBase(new Date(iso)), tz).toBe(expected);
		}
	});
});

describe("nextBillNumber", () => {
	test("the first run of a week gets the plain base", () => {
		expect(nextBillNumber("KW-44-26", [])).toBe("KW-44-26");
	});

	test("later runs count up from the highest suffix", () => {
		expect(nextBillNumber("KW-44-26", ["KW-44-26"])).toBe("KW-44-26-2");
		expect(nextBillNumber("KW-44-26", ["KW-44-26", "KW-44-26-3"])).toBe(
			"KW-44-26-4",
		);
		expect(nextBillNumber("KW-44-26", ["KW-44-26-2", "KW-44-26"])).toBe(
			"KW-44-26-3",
		);
	});

	test("ignores numbers that only share the prefix", () => {
		expect(nextBillNumber("KW-01-2", ["KW-01-26"])).toBe("KW-01-2");
	});
});
