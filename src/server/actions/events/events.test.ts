import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { eventRsvps, events } from "~/server/db/schema";
import { createEvent, createRsvp } from "../../../../test/factories/events";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	switchTenant,
	tenantDb,
} from "../../../../test/harness";
import {
	createEvent as createEventAction,
	deleteEvent,
	getAllEvents,
	getPublicPastEvents,
	getPublicUpcomingEvents,
	getUpcomingEvents,
	updateEvent,
} from "./events";

setupTestDatabases();

const NOW = new Date("2026-10-26T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

async function storedEvent(id: string) {
	const [row] = await tenantDb().select().from(events).where(eq(events.id, id));
	return row ?? null;
}

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.useRealTimers();
});

async function asAdmin() {
	await createTenant();
	const admin = await createUser({ roles: ["Admin"] });
	signInAs(admin);
	return admin;
}

describe("createEvent / updateEvent / deleteEvent", () => {
	test("creates an event with all optional fields", async () => {
		const admin = await asAdmin();

		const result = await createEventAction({
			title: "Stiftungsfest",
			description: "Mit Damen",
			date: days(10),
			endDate: days(11),
			location: "adH",
			type: "AHV",
			isPublic: true,
			rsvpDeadline: days(5),
			maxAttendees: 80,
			meetingUrl: "https://meet.example/abc",
			createdBy: admin.id,
		});

		expect(result).toEqual({ success: true });
		expect(await tenantDb().select().from(events)).toEqual([
			expect.objectContaining({
				title: "Stiftungsfest",
				date: days(10),
				endDate: days(11),
				type: "AHV",
				isCancelled: false,
				rsvpDeadline: days(5),
				maxAttendees: 80,
				meetingUrl: "https://meet.example/abc",
				createdBy: admin.id,
			}),
		]);
	});

	test("updates only the given fields", async () => {
		await asAdmin();
		const event = await createEvent({
			title: "Kneipe",
			location: "adH",
			maxAttendees: 30,
		});

		await updateEvent(event.id, { title: "Fuxenkneipe", maxAttendees: null });

		expect(await storedEvent(event.id)).toMatchObject({
			title: "Fuxenkneipe",
			location: "adH",
			maxAttendees: null,
		});
	});

	test("deleting an event removes its RSVPs", async () => {
		await asAdmin();
		const event = await createEvent();
		await createRsvp({ event, user: await createUser(), status: "yes" });

		expect(await deleteEvent(event.id)).toEqual({ success: true });

		expect(await storedEvent(event.id)).toBeNull();
		expect(await tenantDb().select().from(eventRsvps)).toHaveLength(0);
	});

	test("events stay inside their tenant", async () => {
		const a = await createTenant();
		const b = await createTenant();
		signInAs(await createUser({ roles: ["Admin"], tenantId: a.id }));
		await createEventAction({
			title: "Nur A",
			date: days(1),
			type: "Intern",
			isPublic: true,
		});

		switchTenant(b);
		await expect(getAllEvents()).rejects.toThrow("Nicht angemeldet");
		switchTenant(a);
		expect(await getAllEvents()).toHaveLength(1);
	});
});

describe("event lists", () => {
	test("upcoming lists start now, ascending, and honour the limit", async () => {
		await asAdmin();
		await createEvent({ title: "gestern", date: days(-1) });
		await createEvent({ title: "übermorgen", date: days(2) });
		await createEvent({ title: "morgen", date: days(1), isPublic: false });
		await createEvent({ title: "nächste Woche", date: days(7) });

		expect((await getUpcomingEvents()).map((e) => e.title)).toEqual([
			"morgen",
			"übermorgen",
			"nächste Woche",
		]);
		expect((await getUpcomingEvents(1)).map((e) => e.title)).toEqual([
			"morgen",
		]);
		expect((await getPublicUpcomingEvents()).map((e) => e.title)).toEqual([
			"übermorgen",
			"nächste Woche",
		]);
		expect((await getPublicUpcomingEvents(1)).map((e) => e.title)).toEqual([
			"übermorgen",
		]);
	});

	test("public past events are newest first", async () => {
		await asAdmin();
		await createEvent({ title: "vor einer Woche", date: days(-7) });
		await createEvent({ title: "gestern", date: days(-1) });
		await createEvent({ title: "intern", date: days(-2), isPublic: false });
		await createEvent({ title: "morgen", date: days(1) });

		expect((await getPublicPastEvents()).map((e) => e.title)).toEqual([
			"gestern",
			"vor einer Woche",
		]);
		expect(await getPublicPastEvents(1)).toHaveLength(1);
	});

	test("getAllEvents counts yes and maybe answers per event", async () => {
		await asAdmin();
		const busy = await createEvent({ title: "busy", date: days(3) });
		await createEvent({ title: "empty", date: days(2) });
		for (const status of ["yes", "yes", "maybe", "no"] as const) {
			await createRsvp({ event: busy, user: await createUser(), status });
		}

		const all = await getAllEvents();

		expect(all.map((e) => [e.title, e.yesCount, e.maybeCount])).toEqual([
			["busy", 2, 1],
			["empty", 0, 0],
		]);
	});
});
