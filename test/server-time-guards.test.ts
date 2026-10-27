// Source guard for server-side dates (#15). Production servers run in UTC,
// dev machines in Europe/Berlin, so anything that reads or writes the
// process's local time works on a laptop and is off by one or two hours (or
// a whole day around midnight) in production. Wall-clock values go through
// src/lib/time.ts (getZonedParts, dayKeyInTZ, addDaysInTZ, wallClockToUTC …)
// or src/lib/format.ts (formatDate, formatDateWith, formatTime …).
//
// UTC getters (getUTCDate, setUTCDate …) are not flagged: they are fine for
// arithmetic on `YYYY-MM-DD` keys and for genuinely UTC values.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(path.join(ROOT, dir), {
		withFileTypes: true,
	})) {
		const rel = path.posix.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...sourceFiles(rel));
		} else if (
			/\.tsx?$/.test(entry.name) &&
			!/\.test\.tsx?$/.test(entry.name)
		) {
			out.push(rel);
		}
	}
	return out;
}

/** Code that runs on the server: actions, server libs, route handlers. */
const SERVER_FILES = [
	...sourceFiles("src/server"),
	...sourceFiles("src/app/api"),
];

/** Each pattern reads or formats a Date in the process's local time zone. */
const LOCAL_TIME = [
	// getHours(), setDate(), getDay() …, but not getUTCHours().
	/\.(get|set)(FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds)\(/,
	/\.getTimezoneOffset\(/,
	// toLocaleDateString() & co. default to the process zone and locale.
	/\.toLocale(Date|Time)?String\(/,
	/\.to(Date|Time)String\(/,
	// new Date(2026, 9, 25) is local midnight; use Date.UTC or wallClockToUTC.
	/new Date\(\s*[\w.]+\s*,/,
	// A formatter without timeZone uses the process zone; use format.ts.
	/new Intl\.DateTimeFormat\(/,
	// date-fns reads and writes local fields.
	/from ["']date-fns/,
];

/**
 * Justified local-time uses, keyed `file: trimmed source line`, each with a
 * one-line reason. Entries that no longer match fail the stale-entry test.
 */
const ALLOWED: Record<string, string> = {};

function hits(): string[] {
	const out: string[] = [];
	for (const file of SERVER_FILES) {
		const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");
		lines.forEach((line, i) => {
			if (/^\s*(\/\/|\*)/.test(line)) {
				return;
			}
			if (LOCAL_TIME.some((p) => p.test(line))) {
				out.push(`${file}:${i + 1}: ${line.trim()}`);
			}
		});
	}
	return out;
}

const key = (hit: string) => hit.replace(/:\d+: /, ": ");

describe("server dates are Berlin wall-clock, not process-local (#15)", () => {
	test("no local-time Date getters, setters or formatters in server code", () => {
		const offending = hits().filter((h) => !(key(h) in ALLOWED));
		expect(
			offending,
			"Use src/lib/time.ts or src/lib/format.ts, or add a justified entry to ALLOWED",
		).toEqual([]);
	});

	test("every allowlist entry still matches and has a reason", () => {
		const current = new Set(hits().map(key));
		for (const [entry, reason] of Object.entries(ALLOWED)) {
			expect(current.has(entry), `stale allowlist entry: ${entry}`).toBe(true);
			expect(reason.trim(), `no reason for ${entry}`).not.toBe("");
		}
	});

	test.each([
		["d.getHours()", true],
		["d.setDate(d.getDate() + 1)", true],
		["d.getDay()", true],
		["now.getFullYear()", true],
		["d.toLocaleDateString('de-DE')", true],
		["d.toLocaleString()", true],
		["new Date(year, month - 1, day)", true],
		['new Intl.DateTimeFormat("de-DE", { month: "long" })', true],
		['import { format } from "date-fns";', true],
		["d.getUTCHours()", false],
		["next.setUTCDate(next.getUTCDate() + 1)", false],
		["new Date(Date.UTC(2026, 9, 25))", false],
		['new Date("2026-10-25T00:00:00Z")', false],
		["new Date(input)", false],
		["Date.now()", false],
		["d.getTime()", false],
	])("pattern check: %s → %s", (line, flagged) => {
		expect(LOCAL_TIME.some((p) => p.test(line))).toBe(flagged);
	});
});
