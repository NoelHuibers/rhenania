"use server";

import { and, asc, count, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { eventRsvps, events, users } from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";
import { ROLES, requireMember, requireRole } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { ConflictError, NotFoundError } from "~/server/lib/domain-error";

export type RsvpStatus = "yes" | "no" | "maybe";

export type RsvpCounts = {
	yes: number;
	no: number;
	maybe: number;
};

const rsvpStatusSchema = z.enum(["yes", "no", "maybe"]);

const RSVP_PAGES = ["/semesterprogramm", "/admin/semesterprogramm"];

/**
 * The row for a "yes" answer, selected from the event only while other
 * members' yes answers are still below its attendee limit. An existing yes
 * of the same member is not counted, so re-confirming always succeeds.
 */
function capacityCheckedYes(
	db: TenantDb,
	now: Date,
	eventId: string,
	userId: string,
	note?: string,
) {
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
			updatedAt: sql`${sql.param(now, eventRsvps.updatedAt)}`.as("updated_at"),
		})
		.from(events)
		.where(and(eq(events.id, eventId), lt(othersYes, events.maxAttendees)));
}

export const setRsvp = defineAction(
	{
		schema: z.tuple([z.string(), rsvpStatusSchema, z.string().optional()]),
		revalidate: RSVP_PAGES,
		errorMessage: "Antwort konnte nicht gespeichert werden.",
	},
	async ([eventId, status, note], { tenant, user }) => {
		const { db } = tenant;
		const userId = user.id;
		const now = tenant.now();

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
			throw new NotFoundError("Veranstaltung nicht gefunden.");
		}
		if (event.isCancelled) {
			throw new ConflictError(
				"Die Veranstaltung wurde abgesagt.",
				"EVENT_CANCELLED",
			);
		}
		if (event.rsvpDeadline && event.rsvpDeadline.getTime() < now.getTime()) {
			throw new ConflictError(
				"Die Antwortfrist ist abgelaufen.",
				"DEADLINE_PASSED",
			);
		}

		const onConflict = {
			target: [eventRsvps.eventId, eventRsvps.userId],
			set: {
				status,
				note: note ?? null,
				updatedAt: now,
			},
		};

		if (status === "yes" && event.maxAttendees != null) {
			// Capacity check and write in ONE statement, so simultaneous yes
			// answers cannot both pass the check before either is stored.
			const saved = await db
				.insert(eventRsvps)
				.select(capacityCheckedYes(db, now, eventId, userId, note))
				.onConflictDoUpdate(onConflict)
				.returning({ id: eventRsvps.id });
			if (saved.length === 0) {
				throw new ConflictError(
					"Die Veranstaltung ist bereits voll.",
					"CAPACITY_FULL",
				);
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
	},
);

export const removeRsvp = defineAction(
	{
		schema: z.tuple([z.string()]),
		revalidate: RSVP_PAGES,
		errorMessage: "Antwort konnte nicht gespeichert werden.",
	},
	async ([eventId], { tenant, user }) => {
		await tenant.db
			.delete(eventRsvps)
			.where(
				and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, user.id)),
			);
	},
);

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
