import { getISOWeek, getISOWeekYear } from "date-fns";

import { getZonedParts } from "./time";

/**
 * Base bill number `KW-WW-YY` for a billing run at `date`: the ISO week and
 * ISO week-year of the Europe/Berlin calendar day, independent of the server
 * time zone. Friday 2027-01-01 is `KW-53-26`, Monday 2024-12-30 `KW-01-25`.
 */
export function billNumberBase(date: Date): string {
	const { year, month, day } = getZonedParts(date);
	// Noon on the Berlin calendar day in the process time zone: date-fns reads
	// local fields, and noon exists on every day in every zone.
	const local = new Date(year, month - 1, day, 12);
	const week = String(getISOWeek(local)).padStart(2, "0");
	const weekYear = String(getISOWeekYear(local) % 100).padStart(2, "0");
	return `KW-${week}-${weekYear}`;
}

/**
 * Next free bill number for `base` given the bill numbers already taken
 * (typically those matching `${base}%`). The first run of a week gets the
 * plain base, later runs `-2`, `-3`, ...
 */
export function nextBillNumber(base: string, taken: string[]): string {
	let maxSuffix = 0;
	for (const billNumber of taken) {
		const match = billNumber.match(new RegExp(`^${base}(?:-(\\d+))?$`));
		if (match) {
			const suffix = match[1] ? Number.parseInt(match[1], 10) : 1;
			maxSuffix = Math.max(maxSuffix, suffix);
		}
	}
	return maxSuffix === 0 ? base : `${base}-${maxSuffix + 1}`;
}
