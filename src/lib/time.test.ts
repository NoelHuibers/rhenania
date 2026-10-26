// All helpers work in Europe/Berlin regardless of the process timezone; CI
// runs this file under TZ=Europe/Berlin and TZ=UTC.
//
// DST 2026: clocks jump 02:00 → 03:00 CEST on 2026-03-29 (01:00Z) and fall
// back 03:00 → 02:00 CET on 2026-10-25 (01:00Z).

import { describe, expect, test } from "vitest";

import {
	addDaysInTZ,
	dayKeyInTZ,
	formatAcademicTime,
	formatAcademicTimeAlways,
	formatEventFullDate,
	formatEventMonthLong,
	formatEventShortDate,
	formatEventWeekdayShort,
	getZonedParts,
	sameDayInTZ,
	startOfDayInTZ,
	startOfWeekInTZ,
	utcToDateInput,
	utcToWallClockInput,
	wallClockToUTC,
} from "./time";

const utc = (iso: string) => new Date(`${iso}Z`);

describe("getZonedParts", () => {
	test.each([
		["2026-01-15T19:00:00", { day: 15, hour: 20, weekday: 4 }],
		["2026-07-01T18:00:00", { day: 1, hour: 20, weekday: 3 }],
		// 23:30Z on Saturday is already Sunday in Berlin.
		["2026-10-24T22:30:00", { day: 25, hour: 0, weekday: 0 }],
		["2026-03-29T00:59:00", { hour: 1, minute: 59 }],
		["2026-03-29T01:00:00", { hour: 3, minute: 0 }],
		["2026-10-25T00:30:00", { hour: 2, minute: 30 }],
		["2026-10-25T01:30:00", { hour: 2, minute: 30 }],
		["2026-12-31T23:00:00", { year: 2027, month: 1, day: 1, hour: 0 }],
	])("%sZ", (iso, expected) => {
		expect(getZonedParts(utc(iso))).toMatchObject(expected);
	});

	test("midnight is hour 0, not 24", () => {
		expect(getZonedParts(utc("2026-06-30T22:00:00")).hour).toBe(0);
	});
});

describe("wallClockToUTC", () => {
	test.each([
		["2026-01-15T20:00", "2026-01-15T19:00:00"],
		["2026-07-01T20:00", "2026-07-01T18:00:00"],
		["2026-07-01", "2026-06-30T22:00:00"],
		// Just before and after the spring gap.
		["2026-03-29T00:30", "2026-03-28T23:30:00"],
		["2026-03-29T03:30", "2026-03-29T01:30:00"],
		["2026-03-29", "2026-03-28T23:00:00"],
		// Just before and after the repeated autumn hour.
		["2026-10-25T00:30", "2026-10-24T22:30:00"],
		["2026-10-25T03:30", "2026-10-25T02:30:00"],
		["2026-10-25", "2026-10-24T22:00:00"],
		["2026-10-26", "2026-10-25T23:00:00"],
	])("%s Berlin is %sZ", (input, expected) => {
		expect(wallClockToUTC(input)).toEqual(utc(expected));
	});

	test("a repeated autumn wall-clock time maps to one of its two instants", () => {
		const result = wallClockToUTC("2026-10-25T02:30").toISOString();
		expect(["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]).toContain(
			result,
		);
	});

	test("other timezones and non-matching input", () => {
		expect(wallClockToUTC("2026-07-01T20:00", "UTC")).toEqual(
			utc("2026-07-01T20:00:00"),
		);
		expect(wallClockToUTC("2026-07-01T20:00", "America/New_York")).toEqual(
			utc("2026-07-02T00:00:00"),
		);
		expect(wallClockToUTC("2026-07-01T20:00:00Z")).toEqual(
			utc("2026-07-01T20:00:00"),
		);
	});

	test("round-trips with utcToWallClockInput on ordinary days", () => {
		for (const day of ["2026-01-14", "2026-07-08", "2026-11-04"]) {
			for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
				const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
				const mm = String(minutes % 60).padStart(2, "0");
				const input = `${day}T${hh}:${mm}`;
				expect(utcToWallClockInput(wallClockToUTC(input))).toBe(input);
			}
		}
	});

	// 01:30 is still CET (00:30Z); the guessed offset is read after the switch.
	test.fails("handles the hour before the spring switch (#15)", () => {
		expect(wallClockToUTC("2026-03-29T01:30")).toEqual(
			utc("2026-03-29T00:30:00"),
		);
	});

	// 01:30 is still CEST (2026-10-24T23:30Z); returns 00:30Z = 02:30 CEST.
	test.fails("handles the hour before the autumn switch (#15)", () => {
		expect(wallClockToUTC("2026-10-25T01:30")).toEqual(
			utc("2026-10-24T23:30:00"),
		);
	});
});

describe("formatting inputs", () => {
	test("utcToWallClockInput and utcToDateInput use Berlin wall-clock time", () => {
		expect(utcToWallClockInput(utc("2026-10-24T22:30:00"))).toBe(
			"2026-10-25T00:30",
		);
		expect(utcToWallClockInput(utc("2026-10-25T01:30:00"))).toBe(
			"2026-10-25T02:30",
		);
		expect(utcToDateInput(utc("2026-03-28T23:30:00"))).toBe("2026-03-29");
		expect(utcToDateInput(utc("2026-03-28T22:30:00"))).toBe("2026-03-28");
	});

	test("event date labels are rendered in German for Berlin", () => {
		const lateSunday = utc("2026-10-25T22:30:00");
		expect(formatEventFullDate(lateSunday)).toBe("25. Oktober 2026");
		expect(formatEventFullDate(utc("2026-10-25T23:30:00"))).toBe(
			"26. Oktober 2026",
		);
		expect(formatEventWeekdayShort(lateSunday)).toMatch(/^So/);
		expect(formatEventMonthLong(utc("2026-12-31T23:30:00"))).toBe(
			"Januar 2027",
		);
		expect(formatEventShortDate(lateSunday)).toMatch(/^So.*25\. Okt.* 2026$/);
	});

	test("academic quarter labels follow Berlin time in summer and winter", () => {
		expect(formatAcademicTime(utc("2026-07-01T18:15:00"))).toBe("20 Uhr c.t.");
		expect(formatAcademicTime(utc("2026-01-15T19:15:00"))).toBe("20 Uhr c.t.");
		expect(formatAcademicTime(utc("2026-10-25T02:00:00"))).toBe("3 Uhr s.t.");
		expect(formatAcademicTime(utc("2026-07-01T18:10:00"))).toBe("20:10 Uhr");
	});

	test("midnight means 'no time' unless forced", () => {
		const midnight = wallClockToUTC("2026-10-25");
		expect(formatAcademicTime(midnight)).toBeNull();
		expect(formatAcademicTimeAlways(midnight)).toBe("0 Uhr s.t.");
	});
});

describe("day arithmetic", () => {
	test("dayKeyInTZ and sameDayInTZ use the Berlin calendar day", () => {
		expect(dayKeyInTZ(utc("2026-10-24T22:30:00"))).toBe("2026-10-25");
		expect(dayKeyInTZ(utc("2026-10-24T22:30:00"), "UTC")).toBe("2026-10-24");
		expect(
			sameDayInTZ(utc("2026-10-24T22:30:00"), utc("2026-10-25T22:59:00")),
		).toBe(true);
		expect(
			sameDayInTZ(utc("2026-10-24T21:59:00"), utc("2026-10-24T22:00:00")),
		).toBe(false);
	});

	test("startOfDayInTZ on DST days", () => {
		expect(startOfDayInTZ(utc("2026-03-29T20:00:00"))).toEqual(
			utc("2026-03-28T23:00:00"),
		);
		expect(startOfDayInTZ(utc("2026-10-25T20:00:00"))).toEqual(
			utc("2026-10-24T22:00:00"),
		);
	});

	test.each([
		["2026-03-28T11:00:00", 1, "2026-03-28T23:00:00"],
		["2026-03-29T10:00:00", 1, "2026-03-29T22:00:00"],
		["2026-10-24T10:00:00", 1, "2026-10-24T22:00:00"],
		["2026-10-26T11:00:00", -1, "2026-10-24T22:00:00"],
		["2026-01-31T11:00:00", 30, "2026-03-01T23:00:00"],
	])("addDaysInTZ(%sZ, %i) is %sZ", (from, days, expected) => {
		expect(addDaysInTZ(utc(from), days)).toEqual(utc(expected));
	});

	// Oct 25 has 25 h, so start + 24 h is still Oct 25 (breaks WeekPreview's next week).
	test.fails("addDaysInTZ steps over the 25-hour autumn day (#135)", () => {
		expect(addDaysInTZ(utc("2026-10-25T10:00:00"), 1)).toEqual(
			utc("2026-10-25T23:00:00"),
		);
	});

	// Mar 29 has 23 h: Mar 30 00:00 − 24 h is Mar 28 23:00, a day too far.
	test.fails("addDaysInTZ steps back over the 23-hour spring day (#135)", () => {
		expect(addDaysInTZ(utc("2026-03-30T10:00:00"), -1)).toEqual(
			utc("2026-03-28T23:00:00"),
		);
	});

	test.each([
		["2026-10-21T10:00:00", "2026-10-18T22:00:00"],
		// Sunday of the autumn switch still belongs to the week from Oct 19.
		["2026-10-25T20:00:00", "2026-10-18T22:00:00"],
		["2026-10-26T00:30:00", "2026-10-25T23:00:00"],
		["2026-03-29T20:00:00", "2026-03-22T23:00:00"],
		["2026-03-30T08:00:00", "2026-03-29T22:00:00"],
	])("startOfWeekInTZ(%sZ) is Monday %sZ", (from, expected) => {
		expect(startOfWeekInTZ(utc(from))).toEqual(utc(expected));
	});
});
