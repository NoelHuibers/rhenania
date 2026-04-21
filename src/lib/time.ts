import { academicTimeLabel } from "./academic-time";

export const APP_TZ = "Europe/Berlin";

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
	if (!match) return new Date(input);
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = match[4] ? Number(match[4]) : 0;
	const minute = match[5] ? Number(match[5]) : 0;

	const wanted = Date.UTC(year, month - 1, day, hour, minute);
	const candidate = new Date(wanted);
	const shownParts = getZonedParts(candidate, tz);
	const shown = Date.UTC(
		shownParts.year,
		shownParts.month - 1,
		shownParts.day,
		shownParts.hour,
		shownParts.minute,
	);
	return new Date(wanted + (wanted - shown));
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
	if (hour === 0 && minute === 0) return null;
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

export function addDaysInTZ(d: Date, days: number, tz: string = APP_TZ): Date {
	const start = startOfDayInTZ(d, tz);
	const shifted = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
	return startOfDayInTZ(shifted, tz);
}

export function startOfWeekInTZ(d: Date, tz: string = APP_TZ): Date {
	const start = startOfDayInTZ(d, tz);
	const { weekday } = getZonedParts(start, tz);
	const diff = (weekday + 6) % 7;
	return addDaysInTZ(start, -diff, tz);
}
