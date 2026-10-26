import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { calendarTokens } from "~/server/db/schema";
import {
	createCalendarToken,
	createEvent,
	createRsvp,
	createVenue,
	hideEventTypes,
} from "../../../../../test/factories/events";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	switchTenant,
	tenantDb,
} from "../../../../../test/harness";
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

function fetchFeed(token: string) {
	return GET(new Request(`https://example.test/api/calendar/${token}`), {
		params: Promise.resolve({ token }),
	});
}

function vevents(ics: string) {
	return ics
		.replace(/\r\n /g, "")
		.split("BEGIN:VEVENT\r\n")
		.slice(1)
		.map((block) => (block.split("\r\nEND:VEVENT")[0] ?? "").split("\r\n"));
}

describe("GET /api/calendar/[token]", () => {
	test("unknown tokens and tokens of another tenant are 404", async () => {
		const a = await createTenant();
		const b = await createTenant();
		const token = await createCalendarToken(
			await createUser({ tenantId: a.id }),
		);

		expect((await fetchFeed("nope")).status).toBe(404);
		switchTenant(b);
		expect((await fetchFeed(token)).status).toBe(404);
		switchTenant(a);
		expect((await fetchFeed(token)).status).toBe(200);
	});

	test("serves the member's personal feed with their RSVP status", async () => {
		await createTenant({ slug: "hassia", displayName: "Corps Hassia" });
		const me = await createUser({
			name: "Max Muster",
			email: "max@example.test",
		});
		const other = await createUser({ name: "Erika" });
		const token = await createCalendarToken(me);
		await createVenue("adH", "Hauptstr. 1, 70174 Stuttgart");
		const kneipe = await createEvent({
			title: "Kneipe",
			date: new Date("2026-11-04T19:00:00Z"),
			location: "adH",
		});
		const ahv = await createEvent({
			title: "AHV-Abend",
			date: new Date("2026-11-05T19:00:00Z"),
		});
		await createRsvp({ event: kneipe, user: me, status: "yes" });
		await createRsvp({ event: kneipe, user: other, status: "maybe" });
		await createRsvp({ event: ahv, user: me, status: "no" });

		const res = await fetchFeed(token);
		const ics = await res.text();

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe(
			"text/calendar; charset=utf-8",
		);
		expect(ics).toContain("X-WR-CALNAME:Corps Hassia Semesterprogramm");
		const [first, second] = vevents(ics);
		expect(first).toEqual(
			expect.arrayContaining([
				`UID:${kneipe.id}@hassia`,
				"DTSTART:20261104T190000Z",
				"DTEND:20261104T210000Z",
				"SUMMARY:Kneipe",
				"ORGANIZER;CN=Corps Hassia:mailto:noreply@hassia.invalid",
				"ATTENDEE;CN=Max Muster;PARTSTAT=ACCEPTED;RSVP=TRUE:mailto:max@example.test",
				`ATTENDEE;CN=Erika;PARTSTAT=TENTATIVE;ROLE=OPT-PARTICIPANT:mailto:noreply+${other.id}@hassia.invalid`,
				"LOCATION:Hauptstr. 1\\, 70174 Stuttgart",
			]),
		);
		expect(second).toContain(
			"ATTENDEE;CN=Max Muster;PARTSTAT=DECLINED;RSVP=TRUE:mailto:max@example.test",
		);
	});

	test("events without an RSVP ask for one", async () => {
		await createTenant();
		const me = await createUser({ name: "Max", email: "max@example.test" });
		const token = await createCalendarToken(me);
		await createEvent();

		const [event] = vevents(await (await fetchFeed(token)).text());

		expect(event).toContain(
			"ATTENDEE;CN=Max;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:max@example.test",
		);
	});

	test("hides the event types the member filtered out", async () => {
		await createTenant();
		const me = await createUser();
		const token = await createCalendarToken(me);
		await hideEventTypes(me, ["AHV"]);
		await createEvent({ title: "Kneipe", type: "Intern" });
		await createEvent({ title: "AHV-Abend", type: "AHV" });

		const ics = await (await fetchFeed(token)).text();

		expect(ics).toContain("SUMMARY:Kneipe");
		expect(ics).not.toContain("AHV-Abend");
	});

	test("online meetings get URL fields and a description line", async () => {
		await createTenant();
		const token = await createCalendarToken(await createUser());
		await createEvent({
			description: "Bitte pünktlich",
			meetingUrl: "https://teams.example/m/1",
			isCancelled: true,
		});

		const [event] = vevents(await (await fetchFeed(token)).text());

		expect(event).toEqual(
			expect.arrayContaining([
				"DESCRIPTION:Bitte pünktlich\\n\\nOnline-Meeting: https://teams.example/m/1",
				"URL:https://teams.example/m/1",
				"X-MICROSOFT-SKYPETEAMSMEETINGURL:https://teams.example/m/1",
				"STATUS:CANCELLED",
			]),
		);
	});

	test("SEQUENCE and LAST-MODIFIED follow the latest RSVP change", async () => {
		await createTenant();
		const me = await createUser();
		const token = await createCalendarToken(me);
		const edited = new Date("2026-10-01T08:00:00Z");
		const answered = new Date("2026-10-20T09:30:00Z");
		const event = await createEvent({ createdAt: edited, updatedAt: edited });
		await createRsvp({
			event,
			user: await createUser(),
			status: "yes",
			at: answered,
		});

		const [vevent] = vevents(await (await fetchFeed(token)).text());

		expect(vevent).toEqual(
			expect.arrayContaining([
				`SEQUENCE:${answered.getTime() / 1000}`,
				"LAST-MODIFIED:20261020T093000Z",
			]),
		);
	});

	test("records when the token was last used", async () => {
		await createTenant();
		const token = await createCalendarToken(await createUser());

		await fetchFeed(token);

		const [row] = await tenantDb().select().from(calendarTokens);
		expect(row?.lastUsedAt).toEqual(NOW);
	});
});
