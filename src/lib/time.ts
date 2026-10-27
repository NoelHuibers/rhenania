import { academicTimeLabel } from "./academic-time";

export const APP_TZ = "Europe/Berlin";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ZonedParts = {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	weekday: number;
};

const PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(tz: string): Intl.DateTimeFormat {
	let f = PARTS_FORMATTER_CACHE.get(tz);
	if (!f) {
		f = new Intl.DateTimeFormat("en-GB", {
			timeZone: tz,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
			weekday: "short",
		});
		PARTS_FORMATTER_CACHE.set(tz, f);
	}
	return f;
}

const WEEKDAY_MAP: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6,
};

export function getZonedParts(date: Date, tz: string = APP_TZ): ZonedParts {
	const parts = getPartsFormatter(tz).formatToParts(date);
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
	const hour = Number(get("hour"));
	return {
		year: Number(get("year")),
		month: Number(get("month")),
		day: Number(get("day")),
		hour: hour === 24 ? 0 : hour,
		minute: Number(get("minute")),
		weekday: WEEKDAY_MAP[get("weekday")] ?? 0,
	};
}

export function wallClockToUTC(input: string, tz: string = APP_TZ): Date {
	const match = input.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
	if (!match) {
		return new Date(input);
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = match[4] ? Number(match[4]) : 0;
	const minute = match[5] ? Number(match[5]) : 0;

	const wanted = Date.UTC(year, month - 1, day, hour, minute);
	// The offset can differ between a wall-clock time and the instant we are
	// looking for when a DST switch lies in between, so try the offsets in
	// effect a day before and a day after and keep those that round-trip.
	// Repeated (autumn) times resolve to the earlier instant; skipped (spring)
	// times are moved forward by the gap, like Temporal's "compatible" mode.
	const before = offsetAt(wanted - MS_PER_DAY, tz);
	const after = offsetAt(wanted + MS_PER_DAY, tz);
	for (const offset of before === after ? [before] : [before, after]) {
		const instant = wanted - offset;
		if (offsetAt(instant, tz) === offset) {
			return new Date(instant);
		}
	}
	return new Date(wanted - before);
}

/** UTC offset of `tz` at the given instant, in milliseconds. */
function offsetAt(instant: number, tz: string): number {
	const p = getZonedParts(new Date(instant), tz);
	const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
	return shown - Math.floor(instant / 60_000) * 60_000;
}

export function utcToWallClockInput(date: Date, tz: string = APP_TZ): string {
	const p = getZonedParts(date, tz);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function utcToDateInput(date: Date, tz: string = APP_TZ): string {
	const p = getZonedParts(date, tz);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function fmt(date: Date, options: Intl.DateTimeFormatOptions) {
	return new Intl.DateTimeFormat("de-DE", {
		timeZone: APP_TZ,
		...options,
	}).format(date);
}

export function formatEventDay(d: Date): string {
	return fmt(d, { day: "numeric" });
}

export function formatEventDay2(d: Date): string {
	return fmt(d, { day: "2-digit" });
}

export function formatEventMonth2(d: Date): string {
	return fmt(d, { month: "2-digit" });
}

export function formatEventWeekdayShort(d: Date): string {
	return fmt(d, { weekday: "short" });
}

export function formatEventMonthLong(d: Date): string {
	return fmt(d, { month: "long", year: "numeric" });
}

export function formatEventMonthName(d: Date): string {
	return fmt(d, { month: "long" });
}

export function formatEventFullDate(d: Date): string {
	return fmt(d, { day: "numeric", month: "long", year: "numeric" });
}

export function formatEventShortDate(d: Date): string {
	return fmt(d, {
		weekday: "short",
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export function formatAcademicTime(d: Date): string | null {
	const { hour, minute } = getZonedParts(d);
	if (hour === 0 && minute === 0) {
		return null;
	}
	return academicTimeLabel(hour, minute);
}

export function formatAcademicTimeAlways(d: Date): string {
	const { hour, minute } = getZonedParts(d);
	return academicTimeLabel(hour, minute);
}

export function dayKeyInTZ(d: Date, tz: string = APP_TZ): string {
	const p = getZonedParts(d, tz);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function sameDayInTZ(a: Date, b: Date, tz: string = APP_TZ): boolean {
	return dayKeyInTZ(a, tz) === dayKeyInTZ(b, tz);
}

export function startOfDayInTZ(d: Date, tz: string = APP_TZ): Date {
	return wallClockToUTC(dayKeyInTZ(d, tz), tz);
}

/**
 * Start of the calendar day `days` days after the one containing `d` (in
 * `tz`). Steps over calendar dates, so 23- and 25-hour DST days count as one.
 */
export function addDaysInTZ(d: Date, days: number, tz: string = APP_TZ): Date {
	const p = getZonedParts(d, tz);
	const target = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
	return wallClockToUTC(target.toISOString().slice(0, 10), tz);
}

export function startOfWeekInTZ(d: Date, tz: string = APP_TZ): Date {
	const start = startOfDayInTZ(d, tz);
	const { weekday } = getZonedParts(start, tz);
	const diff = (weekday + 6) % 7;
	return addDaysInTZ(start, -diff, tz);
}

/** `YYYY-MM-DD` for a year, a 0-based month that may overflow, and a day. */
function calendarKey(year: number, monthIndex: number, day: number): string {
	return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

/**
 * Start of the calendar month `months` months after the one containing `d`
 * (in `tz`); `0` is the current month, `-1` the previous one.
 */
export function startOfMonthInTZ(
	d: Date,
	months = 0,
	tz: string = APP_TZ,
): Date {
	const p = getZonedParts(d, tz);
	return wallClockToUTC(calendarKey(p.year, p.month - 1 + months, 1), tz);
}

/**
 * The same wall-clock time in `tz`, `months` calendar months after `d`. A day
 * the target month lacks is clamped to its last day (31 Aug + 6 months is
 * 28 Feb), like date-fns `addMonths`.
 */
export function addMonthsInTZ(
	d: Date,
	months: number,
	tz: string = APP_TZ,
): Date {
	const p = getZonedParts(d, tz);
	const monthIndex = p.month - 1 + months;
	const daysInTarget = new Date(
		Date.UTC(p.year, monthIndex + 1, 0),
	).getUTCDate();
	const day = calendarKey(p.year, monthIndex, Math.min(p.day, daysInTarget));
	const pad = (n: number) => String(n).padStart(2, "0");
	const atMinute = wallClockToUTC(`${day}T${pad(p.hour)}:${pad(p.minute)}`, tz);
	// getZonedParts stops at minutes; carry the seconds and milliseconds over.
	const belowMinute = ((d.getTime() % 60_000) + 60_000) % 60_000;
	return new Date(atMinute.getTime() + belowMinute);
}
