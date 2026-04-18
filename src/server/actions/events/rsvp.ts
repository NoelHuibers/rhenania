"use server";

import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { eventRsvps, events, users } from "~/server/db/schema";

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

export async function setRsvp(
	eventId: string,
	status: RsvpStatus,
	note?: string,
): Promise<SetRsvpResult> {
	try {
		const session = await auth();
		if (!session?.user?.id) return fail("unauthenticated");
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

		if (!event) return fail("event_not_found");
		if (event.isCancelled) return fail("event_cancelled");

		if (event.rsvpDeadline && event.rsvpDeadline.getTime() < Date.now()) {
			return fail("deadline_passed");
		}

		if (status === "yes" && event.maxAttendees != null) {
			const [existing] = await db
				.select({ status: eventRsvps.status })
				.from(eventRsvps)
				.where(
					and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId)),
				)
				.limit(1);

			const wouldAddYes = existing?.status !== "yes";
			if (wouldAddYes) {
				const [yesCount] = await db
					.select({ c: count() })
					.from(eventRsvps)
					.where(
						and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.status, "yes")),
					);
				if ((yesCount?.c ?? 0) >= event.maxAttendees) {
					return fail("capacity_full");
				}
			}
		}

		await db
			.insert(eventRsvps)
			.values({
				eventId,
				userId,
				status,
				note: note ?? null,
			})
			.onConflictDoUpdate({
				target: [eventRsvps.eventId, eventRsvps.userId],
				set: {
					status,
					note: note ?? null,
					updatedAt: new Date(),
				},
			});

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
		if (!session?.user?.id) return fail("unauthenticated");

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

export async function getUserRsvp(eventId: string) {
	const session = await auth();
	if (!session?.user?.id) return null;

	const [row] = await db
		.select({
			status: eventRsvps.status,
			note: eventRsvps.note,
		})
		.from(eventRsvps)
		.where(
			and(
				eq(eventRsvps.eventId, eventId),
				eq(eventRsvps.userId, session.user.id),
			),
		)
		.limit(1);

	return row ?? null;
}

export async function getUserRsvpsForEvents(eventIds: string[]) {
	if (eventIds.length === 0) return new Map<string, RsvpStatus>();
	const session = await auth();
	if (!session?.user?.id) return new Map<string, RsvpStatus>();

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
	const empty: RsvpCounts = { yes: 0, no: 0, maybe: 0 };
	if (eventIds.length === 0) return new Map<string, RsvpCounts>();

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
	for (const id of eventIds) map.set(id, { ...empty });
	for (const r of rows) {
		const entry = map.get(r.eventId);
		if (!entry) continue;
		entry[r.status as RsvpStatus] = r.c;
	}
	return map;
}

export async function getEventRsvps(eventId: string) {
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
	if (eventIds.length === 0) return new Map<string, AttendeePreview[]>();

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
	for (const id of eventIds) map.set(id, []);
	for (const r of rows) {
		const list = map.get(r.eventId);
		if (!list || list.length >= PREVIEW_LIMIT) continue;
		list.push({ userId: r.userId, name: r.name, image: r.image });
	}
	return map;
}

export async function getEventAttendees(eventId: string) {
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
