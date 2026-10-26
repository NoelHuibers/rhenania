// format.ts — the one place that turns amounts and instants into text for
// the UI. Everything is German (de-DE) and shown in Berlin time (APP_TZ),
// whatever the browser or server is set to, so a member sees "3,50 €" and
// the same calendar day on the menu, on the bill and in the PDF preview.
//
// Formatters are created once and reused; building an Intl formatter is
// far more expensive than calling it.

import { roundToCent } from "./money";
import { APP_TZ, dayKeyInTZ } from "./time";

export const APP_LOCALE = "de-DE";

/** Shown instead of a date or amount that is missing or invalid. */
export const EMPTY_VALUE = "—";

type DateInput = Date | string | number;

const eur = new Intl.NumberFormat(APP_LOCALE, {
	style: "currency",
	currency: "EUR",
});

const eurSigned = new Intl.NumberFormat(APP_LOCALE, {
	style: "currency",
	currency: "EUR",
	signDisplay: "exceptZero",
});

/**
 * Euro amount in German notation: `3,50 €`, `-12,30 €`, `1.234,50 €`.
 * `signed` adds a plus sign to positive amounts (`+3,50 €`), for deltas.
 * Non-finite input renders as `0,00 €` rather than `NaN €`.
 */
export function formatEUR(
	amount: number | null | undefined,
	options: { signed?: boolean } = {},
): string {
	const value =
		typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
	// Round like the books do (half away from zero, float noise removed), which
	// also turns -0.004 into 0 instead of "-0,00 €".
	return (options.signed ? eurSigned : eur).format(roundToCent(value));
}

/**
 * A plain decimal with two fraction digits and no currency sign (`3,50`), for
 * prefilled input fields that the user edits as German text.
 */
export function formatDecimalInput(amount: number): string {
	return decimalInput.format(roundToCent(Number.isFinite(amount) ? amount : 0));
}

const decimalInput = new Intl.NumberFormat(APP_LOCALE, {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2,
	useGrouping: false,
});

/**
 * Date styles used across the app:
 * - `numeric` `05.03.2026` (tables, lists; the default)
 * - `short`   `5. März 2026` with an abbreviated month (`5. Okt. 2026`)
 * - `long`    `5. März 2026`
 * - `weekday` `Do., 05.03.2026`
 */
export type DateStyle = "numeric" | "short" | "long" | "weekday";

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
	numeric: { day: "2-digit", month: "2-digit", year: "numeric" },
	short: { day: "numeric", month: "short", year: "numeric" },
	long: { day: "numeric", month: "long", year: "numeric" },
	weekday: {
		weekday: "short",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	},
};

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(
	key: string,
	options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
	let f = dateFormatters.get(key);
	if (!f) {
		f = new Intl.DateTimeFormat(APP_LOCALE, { timeZone: APP_TZ, ...options });
		dateFormatters.set(key, f);
	}
	return f;
}

function toDate(input: DateInput | null | undefined): Date | null {
	if (input === null || input === undefined || input === "") {
		return null;
	}
	const d = input instanceof Date ? input : new Date(input);
	return Number.isNaN(d.getTime()) ? null : d;
}

/** Calendar date in Berlin time, e.g. `05.03.2026`. `—` when missing. */
export function formatDate(
	input: DateInput | null | undefined,
	style: DateStyle = "numeric",
): string {
	const d = toDate(input);
	return d
		? dateFormatter(`date:${style}`, DATE_OPTIONS[style]).format(d)
		: EMPTY_VALUE;
}

/**
 * Escape hatch for layouts that need specific date parts (a week range, a
 * month heading). Still de-DE and Berlin time; prefer `formatDate` styles.
 */
export function formatDateWith(
	input: DateInput | null | undefined,
	options: Intl.DateTimeFormatOptions,
): string {
	const d = toDate(input);
	return d
		? dateFormatter(`custom:${JSON.stringify(options)}`, options).format(d)
		: EMPTY_VALUE;
}

/** Wall-clock time in Berlin, `20:15` (or `20:15:30` with seconds). */
export function formatTime(
	input: DateInput | null | undefined,
	options: { seconds?: boolean } = {},
): string {
	const d = toDate(input);
	if (!d) {
		return EMPTY_VALUE;
	}
	const key = options.seconds ? "time:s" : "time";
	return dateFormatter(key, {
		hour: "2-digit",
		minute: "2-digit",
		...(options.seconds ? { second: "2-digit" } : {}),
		hourCycle: "h23",
	}).format(d);
}

/** Date and time in Berlin, `05.03.2026, 20:15`. */
export function formatDateTime(input: DateInput | null | undefined): string {
	const d = toDate(input);
	if (!d) {
		return EMPTY_VALUE;
	}
	return dateFormatter("datetime", {
		...DATE_OPTIONS.numeric,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(d);
}

const relative = new Intl.RelativeTimeFormat(APP_LOCALE, { numeric: "auto" });

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Whole calendar days (in Berlin) from `from` to `to`. */
function calendarDaysBetween(from: Date, to: Date): number {
	const day = (d: Date) => Date.parse(`${dayKeyInTZ(d)}T00:00:00Z`);
	return Math.round((day(to) - day(from)) / DAY);
}

/**
 * How long ago (or how far ahead) `input` is relative to `now`:
 * `gerade eben`, `vor 5 Minuten`, `vor 3 Stunden`, then calendar days in
 * Berlin (`gestern`, `vor 4 Tagen`). Older than four weeks falls back to the
 * date.
 */
export function formatRelative(
	input: DateInput | null | undefined,
	now: DateInput = Date.now(),
): string {
	const d = toDate(input);
	const reference = toDate(now);
	if (!d || !reference) {
		return EMPTY_VALUE;
	}
	const diff = d.getTime() - reference.getTime();
	const abs = Math.abs(diff);
	if (abs < MINUTE) {
		return "gerade eben";
	}
	// Truncate towards zero so "59 minutes ago" never reads as "vor 1 Stunde".
	const whole = (unit: number) => Math.trunc(diff / unit);
	if (abs < HOUR) {
		return relative.format(whole(MINUTE), "minute");
	}
	if (abs < DAY) {
		return relative.format(whole(HOUR), "hour");
	}
	const days = calendarDaysBetween(reference, d);
	if (Math.abs(days) < 28) {
		return relative.format(days, "day");
	}
	return formatDate(d);
}
