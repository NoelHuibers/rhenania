import { describe, expect, test } from "vitest";
import {
	EMPTY_VALUE,
	formatDate,
	formatDateTime,
	formatDateWith,
	formatDecimalInput,
	formatEUR,
	formatRelative,
	formatTime,
} from "./format";

// Intl separates number and currency (and some date parts) with a
// non-breaking space; compare against plain spaces.
const plain = (s: string) => s.replace(/\s/g, " ");

describe("formatEUR", () => {
	test.each([
		[3.5, "3,50 €"],
		[1234.5, "1.234,50 €"],
		[-12.3, "-12,30 €"],
		[0, "0,00 €"],
		[0.005, "0,01 €"],
		[1.005, "1,01 €"],
		[-0.004, "0,00 €"],
		[1_000_000, "1.000.000,00 €"],
	])("formats %s as %s", (n, expected) => {
		expect(plain(formatEUR(n))).toBe(expected);
	});

	test("non-finite and missing amounts render as zero instead of NaN €", () => {
		for (const n of [Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
			expect(plain(formatEUR(n))).toBe("0,00 €");
		}
	});

	test("signed amounts carry an explicit plus, zero stays unsigned", () => {
		expect(plain(formatEUR(3.5, { signed: true }))).toBe("+3,50 €");
		expect(plain(formatEUR(-3.5, { signed: true }))).toBe("-3,50 €");
		expect(plain(formatEUR(0, { signed: true }))).toBe("0,00 €");
	});
});

test("formatDecimalInput gives an editable German decimal", () => {
	expect(formatDecimalInput(0.25)).toBe("0,25");
	expect(formatDecimalInput(1234.5)).toBe("1234,50");
	expect(formatDecimalInput(Number.NaN)).toBe("0,00");
});

describe("dates are shown in Berlin time", () => {
	// 23:30 UTC on 31 Dec is already New Year's Day in Berlin (UTC+1).
	const newYear = new Date("2025-12-31T23:30:00Z");
	// 22:15 UTC in summer is 00:15 the next day in Berlin (UTC+2).
	const summerNight = new Date("2026-07-04T22:15:00Z");

	test("formatDate uses the Berlin calendar day", () => {
		expect(formatDate(newYear)).toBe("01.01.2026");
		expect(formatDate(summerNight)).toBe("05.07.2026");
	});

	test.each([
		["numeric", "05.03.2026"],
		["short", "5. März 2026"],
		["long", "5. März 2026"],
		["weekday", "Do., 05.03.2026"],
	] as const)("style %s", (style, expected) => {
		expect(plain(formatDate("2026-03-05T12:00:00Z", style))).toBe(expected);
	});

	test("short style abbreviates long month names", () => {
		expect(formatDate("2026-10-05T12:00:00Z", "short")).toBe("5. Okt. 2026");
	});

	test("accepts ISO strings and timestamps", () => {
		expect(formatDate("2026-03-05T12:00:00Z")).toBe("05.03.2026");
		expect(formatDate(Date.UTC(2026, 2, 5, 12))).toBe("05.03.2026");
	});

	test("formatDateWith keeps Berlin time for custom parts", () => {
		expect(formatDateWith(newYear, { year: "numeric" })).toBe("2026");
		expect(
			formatDateWith(summerNight, { day: "numeric", month: "short" }),
		).toBe("5. Juli");
		expect(formatDateWith(null, { year: "numeric" })).toBe(EMPTY_VALUE);
	});

	test("formatTime and formatDateTime use the Berlin wall clock", () => {
		expect(formatTime(summerNight)).toBe("00:15");
		expect(formatTime(summerNight, { seconds: true })).toBe("00:15:00");
		expect(plain(formatDateTime(newYear))).toBe("01.01.2026, 00:30");
	});

	test("missing or invalid dates render as a dash", () => {
		for (const d of [null, undefined, "", "not a date"]) {
			expect(formatDate(d)).toBe(EMPTY_VALUE);
			expect(formatTime(d)).toBe(EMPTY_VALUE);
			expect(formatDateTime(d)).toBe(EMPTY_VALUE);
			expect(formatRelative(d)).toBe(EMPTY_VALUE);
		}
	});
});

describe("formatRelative", () => {
	const now = new Date("2026-03-05T12:00:00Z"); // 13:00 in Berlin
	const ago = (ms: number) => new Date(now.getTime() - ms);
	const MIN = 60_000;

	test.each([
		[30_000, "gerade eben"],
		[5 * MIN, "vor 5 Minuten"],
		[59 * MIN, "vor 59 Minuten"],
		[3 * 60 * MIN, "vor 3 Stunden"],
		[4 * 24 * 60 * MIN, "vor 4 Tagen"],
	])("%s ms ago reads %s", (ms, expected) => {
		expect(formatRelative(ago(ms), now)).toBe(expected);
	});

	test("counts Berlin calendar days, not 24-hour blocks", () => {
		// 23:30 Berlin two days back is 37.5 hours ago but "vorgestern".
		expect(formatRelative("2026-03-03T22:30:00Z", now)).toBe("vorgestern");
		expect(formatRelative("2026-03-04T08:00:00Z", now)).toBe("gestern");
	});

	test("future instants read forwards", () => {
		expect(formatRelative(new Date(now.getTime() + 2 * 60 * MIN), now)).toBe(
			"in 2 Stunden",
		);
	});

	test("older than four weeks falls back to the date", () => {
		expect(formatRelative("2026-01-01T12:00:00Z", now)).toBe("01.01.2026");
	});
});
