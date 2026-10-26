import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createEvent, createVenue } from "../../../../test/factories/events";
import { createTenant, setupTestDatabases } from "../../../../test/harness";
import { GET } from "./route";

setupTestDatabases();

const NOW = new Date("2026-10-26T12:00:00Z");

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.useRealTimers();
});

/** Unfolds RFC 5545 continuation lines and splits into content lines. */
function contentLines(ics: string) {
	return ics.replace(/\r\n /g, "").split("\r\n");
}

function vevents(ics: string) {
	return ics
		.split("BEGIN:VEVENT\r\n")
		.slice(1)
		.map((block) => contentLines(block.split("\r\nEND:VEVENT")[0] ?? ""));
}

describe("GET /api/calendar", () => {
	test("serves a VCALENDAR with one VEVENT per event in date order", async () => {
		const tenant = await createTenant();
		const later = await createEvent({
			title: "Stiftungsfest",
			date: new Date("2026-11-14T18:15:00Z"),
			endDate: new Date("2026-11-15T11:00:00Z"),
		});
		const sooner = await createEvent({
			title: "Kneipe",
			date: new Date("2026-11-04T19:00:00Z"),
			isCancelled: true,
		});

		const res = await GET();
		const ics = await res.text();

		expect(res.headers.get("Content-Type")).toBe(
			"text/calendar; charset=utf-8",
		);
		expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
		expect(ics.endsWith("\r\nEND:VCALENDAR")).toBe(true);
		expect(ics).not.toMatch(/[^\r]\n/);
		const [first, second] = vevents(ics);
		expect(first).toEqual([
			`UID:${sooner.id}@${tenant.slug}`,
			"DTSTAMP:20261026T120000Z",
			"DTSTART:20261104T190000Z",
			"DTEND:20261104T210000Z",
			"SUMMARY:Kneipe",
			"STATUS:CANCELLED",
		]);
		expect(second).toEqual(
			expect.arrayContaining([
				`UID:${later.id}@${tenant.slug}`,
				"DTSTART:20261114T181500Z",
				"DTEND:20261115T110000Z",
			]),
		);
	});

	test("lists only public events", async () => {
		await createTenant();
		await createEvent({ title: "Kneipe", isPublic: true });
		await createEvent({ title: "Interner Convent", isPublic: false });

		const ics = await (await GET()).text();

		expect(ics).toContain("SUMMARY:Kneipe");
		expect(ics).not.toContain("Interner Convent");
	});

	test("resolves venue short names and escapes text values", async () => {
		await createTenant();
		await createVenue("adH", "Hauptstr. 1, 70174 Stuttgart");
		await createEvent({
			title: "Kneipe; danach Bar, oder so",
			location: "adH",
			description: "Zeile 1\nZeile 2 \\ Ende",
		});
		await createEvent({ title: "Ausflug", location: "Bahnhof" });

		const [kneipe, ausflug] = vevents(await (await GET()).text());

		expect(kneipe).toEqual(
			expect.arrayContaining([
				"SUMMARY:Kneipe\\; danach Bar\\, oder so",
				"LOCATION:Hauptstr. 1\\, 70174 Stuttgart",
				"DESCRIPTION:Zeile 1\\nZeile 2 \\\\ Ende",
			]),
		);
		expect(ausflug).toContain("LOCATION:Bahnhof");
	});

	test("folds long lines at 75 characters", async () => {
		await createTenant();
		const title = "Semesterantrittskneipe ".repeat(8).trim();
		await createEvent({ title });

		const ics = await (await GET()).text();
		const physical = ics.split("\r\n");

		expect(physical.every((line) => line.length <= 75)).toBe(true);
		expect(contentLines(ics)).toContain(`SUMMARY:${title}`);
	});

	// Folding counts UTF-8 octets: lines with umlauts must not exceed the
	// 75-octet limit and an emoji at the fold point must stay in one piece.
	test("folds by octets without splitting characters (#146)", async () => {
		await createTenant();
		// "SUMMARY:" + 66 characters puts the emoji's two code units at 74/75.
		const title = `${"Fuchsenprüfung ".repeat(4)}Grill 🍺 und mehr`;
		await createEvent({ title });

		const res = await GET();
		const ics = new TextDecoder().decode(await res.arrayBuffer());
		const physical = ics.split("\r\n");

		expect(contentLines(ics)).toContain(`SUMMARY:${title}`);
		expect(
			physical.every((line) => Buffer.byteLength(line, "utf8") <= 75),
		).toBe(true);
	});

	// Like the per-member feed, UIDs and calendar name belong to the tenant.
	test("names the calendar after the tenant (#36)", async () => {
		await createTenant({ slug: "hassia", displayName: "Corps Hassia" });
		const event = await createEvent();

		const ics = await (await GET()).text();

		expect(contentLines(ics)).toContain(
			"X-WR-CALNAME:Corps Hassia Semesterprogramm",
		);
		expect(contentLines(ics)).toContain(
			"PRODID:-//Corps Hassia//Semesterprogramm//DE",
		);
		expect(ics).toContain(`UID:${event.id}@hassia`);
		expect(ics).not.toContain("Rhenania");
	});

	test("is 404 on a host without a tenant", async () => {
		const res = await GET();

		expect(res.status).toBe(404);
	});
});
