import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { eventRsvps } from "~/server/db/schema";
import { createEvent, createRsvp } from "../../../../test/factories/events";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	getEventAttendees,
	getEventRsvps,
	getRsvpCountsForEvents,
	getUserRsvp,
	getUserRsvpsForEvents,
	getYesAttendeePreviewForEvents,
	removeRsvp,
	setRsvp,
} from "./rsvp";

setupTestDatabases();

const NOW = new Date("2026-10-26T12:00:00Z");

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.useRealTimers();
});

async function member(name?: string) {
	return createUser({ name });
}

describe("setRsvp", () => {
	test("records an answer with a note and lets the member change it", async () => {
		await createTenant();
		const me = await member();
		const event = await createEvent();
		signInAs(me);

		expect(await setRsvp(event.id, "maybe", "komme später")).toEqual({
			success: true,
		});
		expect(await getUserRsvp(event.id)).toEqual({
			status: "maybe",
			note: "komme später",
		});

		await setRsvp(event.id, "yes");
		expect(await getUserRsvp(event.id)).toEqual({ status: "yes", note: null });
		expect(await tenantDb().select().from(eventRsvps)).toHaveLength(1);
	});

	test("rejects unknown and cancelled events and passed deadlines", async () => {
		await createTenant();
		signInAs(await member());
		const cancelled = await createEvent({ isCancelled: true });
		const closed = await createEvent({
			rsvpDeadline: new Date(NOW.getTime() - 1000),
		});
		const open = await createEvent({
			rsvpDeadline: new Date(NOW.getTime() + 60_000),
		});

		expect(await setRsvp("missing", "yes")).toMatchObject({
			error: "event_not_found",
		});
		expect(await setRsvp(cancelled.id, "yes")).toMatchObject({
			error: "event_cancelled",
		});
		expect(await setRsvp(closed.id, "yes")).toMatchObject({
			error: "deadline_passed",
			message: "Die Antwortfrist ist abgelaufen.",
		});
		expect(await setRsvp(open.id, "yes")).toEqual({ success: true });
		expect(await tenantDb().select().from(eventRsvps)).toHaveLength(1);
	});

	test("rejects signed-out visitors", async () => {
		await createTenant();
		const event = await createEvent();

		expect(await setRsvp(event.id, "yes")).toMatchObject({
			success: false,
			error: "unauthenticated",
		});
		expect(await removeRsvp(event.id)).toMatchObject({
			error: "unauthenticated",
		});
	});

	test("enforces the attendee limit for new yes answers only", async () => {
		await createTenant();
		const event = await createEvent({ maxAttendees: 2 });
		const [a, b, c] = [await member(), await member(), await member()];
		await createRsvp({ event, user: a, status: "yes" });
		await createRsvp({ event, user: b, status: "yes" });
		await createRsvp({ event, user: c, status: "maybe" });

		signInAs(c);
		expect(await setRsvp(event.id, "yes")).toMatchObject({
			error: "capacity_full",
		});
		expect(await setRsvp(event.id, "no")).toEqual({ success: true });

		signInAs(a);
		expect(await setRsvp(event.id, "yes", "bringe Wein mit")).toEqual({
			success: true,
		});
		await setRsvp(event.id, "no");

		signInAs(c);
		expect(await setRsvp(event.id, "yes")).toEqual({ success: true });
	});

	test("simultaneous yes answers never exceed the attendee limit (#147)", async () => {
		await createTenant();
		const event = await createEvent({ maxAttendees: 1 });
		const [a, b] = [await member(), await member()];

		// The session is read synchronously when each call starts, so both
		// requests run interleaved as two different members.
		signInAs(a);
		const first = setRsvp(event.id, "yes");
		signInAs(b);
		const second = setRsvp(event.id, "yes");
		const results = await Promise.all([first, second]);

		expect(results.filter((r) => r.success)).toHaveLength(1);
		expect(results.filter((r) => !r.success)).toEqual([
			expect.objectContaining({ error: "capacity_full" }),
		]);
		const counts = await getRsvpCountsForEvents([event.id]);
		expect(counts.get(event.id)?.yes).toBe(1);
	});

	test("a capacity-checked yes stores a complete answer", async () => {
		await createTenant();
		const event = await createEvent({ maxAttendees: 3 });
		const me = await member();
		signInAs(me);

		expect(await setRsvp(event.id, "yes", "mit Begleitung")).toEqual({
			success: true,
		});

		const [row] = await tenantDb().select().from(eventRsvps);
		expect(row).toMatchObject({
			eventId: event.id,
			userId: me.id,
			status: "yes",
			note: "mit Begleitung",
			updatedAt: NOW,
		});
		expect(row?.id).toMatch(/^[0-9a-f-]{36}$/);
		expect(row?.createdAt).toBeInstanceOf(Date);
	});
});

describe("removeRsvp", () => {
	test("removes only the caller's answer", async () => {
		await createTenant();
		const event = await createEvent();
		const me = await member();
		const other = await member();
		await createRsvp({ event, user: me, status: "yes" });
		await createRsvp({ event, user: other, status: "yes" });
		signInAs(me);

		expect(await removeRsvp(event.id)).toEqual({ success: true });

		expect(await getUserRsvp(event.id)).toBeNull();
		expect(await tenantDb().select().from(eventRsvps)).toHaveLength(1);
	});
});

describe("RSVP read models", () => {
	test("answers and counts per event", async () => {
		await createTenant();
		signInAs(await createUser({ name: "Leser" }));
		const me = await member();
		const e1 = await createEvent();
		const e2 = await createEvent();
		const e3 = await createEvent();
		await createRsvp({ event: e1, user: me, status: "yes" });
		await createRsvp({ event: e2, user: me, status: "no" });
		await createRsvp({ event: e1, user: await member(), status: "maybe" });
		await createRsvp({ event: e1, user: await member(), status: "yes" });
		signInAs(me);

		expect(await getUserRsvpsForEvents([e1.id, e2.id, e3.id])).toEqual(
			new Map([
				[e1.id, "yes"],
				[e2.id, "no"],
			]),
		);
		expect(await getUserRsvpsForEvents([])).toEqual(new Map());
		expect(await getRsvpCountsForEvents([e1.id, e3.id])).toEqual(
			new Map([
				[e1.id, { yes: 2, no: 0, maybe: 1 }],
				[e3.id, { yes: 0, no: 0, maybe: 0 }],
			]),
		);
		expect(await getRsvpCountsForEvents([])).toEqual(new Map());
	});

	test("attendee lists are sorted by status, then name, and skip declines", async () => {
		await createTenant();
		signInAs(await createUser({ name: "Leser" }));
		const event = await createEvent();
		const answers = [
			["Clara", "yes"],
			["Anna", "maybe"],
			["Bert", "yes"],
			["Dora", "no"],
		] as const;
		for (const [name, status] of answers) {
			await createRsvp({ event, user: await member(name), status });
		}

		signInAs(await createUser({ name: "Admin", roles: ["Admin"] }));
		expect(
			(await getEventRsvps(event.id)).map((r) => [r.userName, r.status]),
		).toEqual([
			["Anna", "maybe"],
			["Dora", "no"],
			["Bert", "yes"],
			["Clara", "yes"],
		]);
		expect((await getEventAttendees(event.id)).map((r) => r.userName)).toEqual([
			"Anna",
			"Bert",
			"Clara",
		]);
	});

	test("the yes preview shows the first four to accept", async () => {
		await createTenant();
		signInAs(await createUser({ name: "Leser" }));
		const event = await createEvent();
		const empty = await createEvent();
		for (let i = 1; i <= 5; i++) {
			await createRsvp({
				event,
				user: await member(`Gast ${i}`),
				status: "yes",
				at: new Date(NOW.getTime() - (10 - i) * 60_000),
			});
		}
		await createRsvp({
			event,
			user: await member("Vielleicht"),
			status: "maybe",
		});

		const preview = await getYesAttendeePreviewForEvents([event.id, empty.id]);

		expect(preview.get(event.id)?.map((p) => p.name)).toEqual([
			"Gast 1",
			"Gast 2",
			"Gast 3",
			"Gast 4",
		]);
		expect(preview.get(empty.id)).toEqual([]);
		expect(await getYesAttendeePreviewForEvents([])).toEqual(new Map());
	});
});
