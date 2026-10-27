"use server";

import { and, asc, count, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { eventRsvps, events, users } from "~/server/db/schema";
import { ROLES, requireMember, requireRole } from "~/server/lib/authz";

export type RsvpStatus = "yes" | "no" | "maybe";

export type RsvpCounts = {
	yes: number;
	no: number;
	maybe: number;
};

export type RsvpError =
	| "unauthenticated"
	| "event_not_found"
	| "event_cancelled"
	| "deadline_passed"
	| "capacity_full"
	| "db_error";

export type SetRsvpResult =
	| { success: true }
	| { success: false; error: RsvpError; message: string };

const ERROR_MESSAGES: Record<RsvpError, string> = {
	unauthenticated: "Du musst angemeldet sein, um zuzusagen.",
	event_not_found: "Veranstaltung nicht gefunden.",
	event_cancelled: "Die Veranstaltung wurde abgesagt.",
	deadline_passed: "Die Antwortfrist ist abgelaufen.",
	capacity_full: "Die Veranstaltung ist bereits voll.",
	db_error: "Antwort konnte nicht gespeichert werden.",
};

function fail(error: RsvpError): SetRsvpResult {
	return { success: false, error, message: ERROR_MESSAGES[error] };
}

/**
 * The row for a "yes" answer, selected from the event only while other
 * members' yes answers are still below its attendee limit. An existing yes
 * of the same member is not counted, so re-confirming always succeeds.
 */
function capacityCheckedYes(eventId: string, userId: string, note?: string) {
	const othersYes = db
		.select({ c: count() })
		.from(eventRsvps)
		.where(
			and(
				eq(eventRsvps.eventId, eventId),
				eq(eventRsvps.status, "yes"),
				ne(eventRsvps.userId, userId),
			),
		);
	return db
		.select({
			id: sql`${crypto.randomUUID()}`.as("id"),
			eventId: events.id,
			userId: sql`${userId}`.as("user_id"),
			status: sql`'yes'`.as("status"),
			note: sql`${note ?? null}`.as("note"),
			createdAt: sql`(unixepoch())`.as("created_at"),
			updatedAt: sql`${sql.param(new Date(), eventRsvps.updatedAt)}`.as(
				"updated_at",
			),
		})
		.from(events)
		.where(and(eq(events.id, eventId), lt(othersYes, events.maxAttendees)));
}

export async function setRsvp(
	eventId: string,
	status: RsvpStatus,
	note?: string,
): Promise<SetRsvpResult> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return fail("unauthenticated");
		}
		const userId = session.user.id;

		const [event] = await db
			.select({
				id: events.id,
				isCancelled: events.isCancelled,
				rsvpDeadline: events.rsvpDeadline,
				maxAttendees: events.maxAttendees,
			})
			.from(events)
			.where(eq(events.id, eventId))
			.limit(1);

		if (!event) {
			return fail("event_not_found");
		}
		if (event.isCancelled) {
			return fail("event_cancelled");
		}

		if (event.rsvpDeadline && event.rsvpDeadline.getTime() < Date.now()) {
			return fail("deadline_passed");
		}

		const onConflict = {
			target: [eventRsvps.eventId, eventRsvps.userId],
			set: {
				status,
				note: note ?? null,
				updatedAt: new Date(),
			},
		};

		if (status === "yes" && event.maxAttendees != null) {
			// Capacity check and write in ONE statement, so simultaneous yes
			// answers cannot both pass the check before either is stored.
			const saved = await db
				.insert(eventRsvps)
				.select(capacityCheckedYes(eventId, userId, note))
				.onConflictDoUpdate(onConflict)
				.returning({ id: eventRsvps.id });
			if (saved.length === 0) {
				return fail("capacity_full");
			}
		} else {
			await db
				.insert(eventRsvps)
				.values({
					eventId,
					userId,
					status,
					note: note ?? null,
				})
				.onConflictDoUpdate(onConflict);
		}

		revalidatePath("/semesterprogramm");
		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch (error) {
		console.error("Error setting RSVP:", error);
		return fail("db_error");
	}
}

export async function removeRsvp(eventId: string): Promise<SetRsvpResult> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return fail("unauthenticated");
		}

		await db
			.delete(eventRsvps)
			.where(
				and(
					eq(eventRsvps.eventId, eventId),
					eq(eventRsvps.userId, session.user.id),
				),
			);

		revalidatePath("/semesterprogramm");
		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch (error) {
		console.error("Error removing RSVP:", error);
		return fail("db_error");
	}
}

export async function getUserRsvpsForEvents(eventIds: string[]) {
	if (eventIds.length === 0) {
		return new Map<string, RsvpStatus>();
	}
	const session = await auth();
	if (!session?.user?.id) {
		return new Map<string, RsvpStatus>();
	}

	const rows = await db
		.select({
			eventId: eventRsvps.eventId,
			status: eventRsvps.status,
		})
		.from(eventRsvps)
		.where(
			and(
				eq(eventRsvps.userId, session.user.id),
				inArray(eventRsvps.eventId, eventIds),
			),
		);

	return new Map(rows.map((r) => [r.eventId, r.status as RsvpStatus]));
}

export async function getRsvpCountsForEvents(eventIds: string[]) {
	await requireMember();
	const empty: RsvpCounts = { yes: 0, no: 0, maybe: 0 };
	if (eventIds.length === 0) {
		return new Map<string, RsvpCounts>();
	}

	const rows = await db
		.select({
			eventId: eventRsvps.eventId,
			status: eventRsvps.status,
			c: count(),
		})
		.from(eventRsvps)
		.where(inArray(eventRsvps.eventId, eventIds))
		.groupBy(eventRsvps.eventId, eventRsvps.status);

	const map = new Map<string, RsvpCounts>();
	for (const id of eventIds) {
		map.set(id, { ...empty });
	}
	for (const r of rows) {
		const entry = map.get(r.eventId);
		if (!entry) {
			continue;
		}
		entry[r.status as RsvpStatus] = r.c;
	}
	return map;
}

export async function getEventRsvps(eventId: string) {
	await requireRole(ROLES.events);
	return db
		.select({
			userId: eventRsvps.userId,
			userName: users.name,
			userEmail: users.email,
			userImage: users.image,
			status: eventRsvps.status,
			note: eventRsvps.note,
			updatedAt: eventRsvps.updatedAt,
			createdAt: eventRsvps.createdAt,
		})
		.from(eventRsvps)
		.innerJoin(users, eq(eventRsvps.userId, users.id))
		.where(eq(eventRsvps.eventId, eventId))
		.orderBy(sql`${eventRsvps.status} asc, ${users.name} asc`);
}

export type AttendeePreview = {
	userId: string;
	name: string | null;
	image: string | null;
};

const PREVIEW_LIMIT = 4;

export async function getYesAttendeePreviewForEvents(eventIds: string[]) {
	await requireMember();
	if (eventIds.length === 0) {
		return new Map<string, AttendeePreview[]>();
	}

	const rows = await db
		.select({
			eventId: eventRsvps.eventId,
			userId: users.id,
			name: users.name,
			image: users.image,
			createdAt: eventRsvps.createdAt,
		})
		.from(eventRsvps)
		.innerJoin(users, eq(eventRsvps.userId, users.id))
		.where(
			and(eq(eventRsvps.status, "yes"), inArray(eventRsvps.eventId, eventIds)),
		)
		.orderBy(asc(eventRsvps.createdAt));

	const map = new Map<string, AttendeePreview[]>();
	for (const id of eventIds) {
		map.set(id, []);
	}
	for (const r of rows) {
		const list = map.get(r.eventId);
		if (!list || list.length >= PREVIEW_LIMIT) {
			continue;
		}
		list.push({ userId: r.userId, name: r.name, image: r.image });
	}
	return map;
}

export async function getEventAttendees(eventId: string) {
	await requireMember();
	return db
		.select({
			userId: eventRsvps.userId,
			userName: users.name,
			userImage: users.image,
			status: eventRsvps.status,
		})
		.from(eventRsvps)
		.innerJoin(users, eq(eventRsvps.userId, users.id))
		.where(
			and(
				eq(eventRsvps.eventId, eventId),
				inArray(eventRsvps.status, ["yes", "maybe"]),
			),
		)
		.orderBy(sql`${eventRsvps.status} asc, ${users.name} asc`);
}
