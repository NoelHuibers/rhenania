// recurrence.ts — the dates a recurring event template stands for (#33).
//
// Pure: no database, no clock. The events service passes the default range
// (today plus six months, from the scope's clock) for templates without
// their own start and end date.

import { z } from "zod";
import {
	addDaysInTZ,
	dayKeyInTZ,
	getZonedParts,
	startOfDayInTZ,
	wallClockToUTC,
} from "~/lib/time";

export const recurrenceTypeSchema = z.enum([
	"biweekly",
	"monthly_1st_wednesday",
	"monthly_1st_3rd_wednesday",
	"occ_semester",
]);

export type RecurrenceType = z.infer<typeof recurrenceTypeSchema>;

// --- Date helpers ---
//
// Days are Europe/Berlin calendar days, represented by the instant of their
// Berlin midnight and stepped with addDaysInTZ, so DST days (23 h or 25 h)
// still count as one day. Times are Berlin wall-clock times. Nothing here
// depends on the server's time zone.

/** The Berlin wall-clock `time` ("HH:MM") on the Berlin day containing `day`. */
function setTime(day: Date, time: string): Date {
	const [h, m] = time.split(":").map(Number);
	const pad = (n: number) => String(n).padStart(2, "0");
	return wallClockToUTC(`${dayKeyInTZ(day)}T${pad(h ?? 0)}:${pad(m ?? 0)}`);
}

/** Start of the first Berlin day on or after `from` that falls on `dow`. */
function nextDayOfWeek(from: Date, dow: number): Date {
	const { weekday } = getZonedParts(from);
	return addDaysInTZ(from, (dow - weekday + 7) % 7);
}

/** `month` is 0-based, like Date#getMonth. */
function firstWednesdayOfMonth(year: number, month: number): Date {
	const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
	return nextDayOfWeek(wallClockToUTC(first), 3);
}

function thirdWednesdayOfMonth(year: number, month: number): Date {
	return addDaysInTZ(firstWednesdayOfMonth(year, month), 14);
}

// --- Generation per recurrence type ---

type OccurrenceItem = { date: Date; title?: string };

function generateBiweekly(
	anchor: Date,
	dow: number,
	time: string,
	fromDate: Date,
	toDate: Date,
): OccurrenceItem[] {
	// Normalise anchor to the correct day of week
	let start = nextDayOfWeek(anchor, dow);
	// Walk back until start <= fromDate
	while (start > fromDate) {
		start = addDaysInTZ(start, -14);
	}
	// Walk forward to first occurrence >= fromDate
	while (start < fromDate) {
		start = addDaysInTZ(start, 14);
	}
	const items: OccurrenceItem[] = [];
	let current = start;
	while (current <= toDate) {
		items.push({ date: setTime(current, time) });
		current = addDaysInTZ(current, 14);
	}
	return items;
}

function generateMonthlyWednesdays(
	which: "1st" | "1st_3rd",
	time: string,
	fromDate: Date,
	toDate: Date,
): OccurrenceItem[] {
	const items: OccurrenceItem[] = [];
	const from = getZonedParts(fromDate);
	let year = from.year;
	let month = from.month - 1;
	while (true) {
		const first = setTime(firstWednesdayOfMonth(year, month), time);
		if (first > toDate) {
			break;
		}
		if (first >= fromDate) {
			items.push({ date: first });
		}
		if (which === "1st_3rd") {
			const third = setTime(thirdWednesdayOfMonth(year, month), time);
			if (third <= toDate && third >= fromDate) {
				items.push({ date: third });
			}
		}
		month++;
		if (month > 11) {
			month = 0;
			year++;
		}
	}
	return items;
}

/**
 * oCC semester: AnCC (Sunday 18:00), numbered Mondays (20:00), AbCC (Sunday 18:00).
 * startDate must be a Sunday (AnCC date).
 * endDate defines the last Sunday (AbCC).
 */
function generateOCCSemester(startDate: Date, endDate: Date): OccurrenceItem[] {
	// Collect biweekly Sundays from startDate to endDate
	const sundays: Date[] = [];
	let current = startOfDayInTZ(startDate);
	while (current <= endDate) {
		sundays.push(current);
		current = addDaysInTZ(current, 14);
	}

	if (sundays.length === 0) {
		return [];
	}

	return sundays.map((sunday, i) => {
		const isFirst = i === 0;
		const isLast = i === sundays.length - 1;

		if (isFirst) {
			return { date: setTime(sunday, "18:00"), title: "AnCC" };
		}
		if (isLast && sundays.length > 1) {
			return { date: setTime(sunday, "18:00"), title: "AbCC" };
		}
		// Middle: shift to Monday 20:00
		const monday = addDaysInTZ(sunday, 1);
		return { date: setTime(monday, "20:00"), title: `${i + 1}. oCC` };
	});
}

export function generateOccurrences(
	template: {
		recurrenceType: RecurrenceType;
		dayOfWeek?: number | null;
		time: string;
		startDate?: Date | null;
		endDate?: Date | null;
	},
	defaultFromDate: Date,
	defaultToDate: Date,
): OccurrenceItem[] {
	const fromDate = template.startDate ?? defaultFromDate;
	const toDate = template.endDate ?? defaultToDate;

	switch (template.recurrenceType) {
		case "biweekly": {
			// startDate serves as the anchor for the biweekly cadence
			return generateBiweekly(
				fromDate,
				template.dayOfWeek ?? 1,
				template.time,
				fromDate,
				toDate,
			);
		}
		case "monthly_1st_wednesday":
			return generateMonthlyWednesdays("1st", template.time, fromDate, toDate);
		case "monthly_1st_3rd_wednesday":
			return generateMonthlyWednesdays(
				"1st_3rd",
				template.time,
				fromDate,
				toDate,
			);
		case "occ_semester": {
			if (!template.startDate || !template.endDate) {
				return [];
			}
			return generateOCCSemester(template.startDate, template.endDate);
		}
		default:
			return [];
	}
}
