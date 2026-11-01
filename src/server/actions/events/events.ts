"use server";

import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/server/db";
import { eventRsvps, events } from "~/server/db/schema";
import { ROLES, requireMember } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";

// Per-tenant configurable; valid values come from the tenant's
// `event_type` table. Kept as `string` for type-level openness.
export type EventType = string;

export async function getUpcomingEvents(limit?: number) {
	await requireMember();
	try {
		const now = new Date();
		const query = db
			.select()
			.from(events)
			.where(gte(events.date, now))
			.orderBy(asc(events.date));

		if (limit) {
			return await query.limit(limit);
		}
		return await query;
	} catch (error) {
		console.error("Error fetching upcoming events:", error);
		return [];
	}
}

export async function getPublicUpcomingEvents(limit?: number) {
	try {
		const now = new Date();
		const query = db
			.select()
			.from(events)
			.where(and(gte(events.date, now), eq(events.isPublic, true)))
			.orderBy(asc(events.date));

		if (limit) {
			return await query.limit(limit);
		}
		return await query;
	} catch (error) {
		console.error("Error fetching public upcoming events:", error);
		return [];
	}
}

export async function getPublicPastEvents(limit?: number) {
	try {
		const now = new Date();
		const query = db
			.select()
			.from(events)
			.where(and(lt(events.date, now), eq(events.isPublic, true)))
			.orderBy(desc(events.date));

		if (limit) {
			return await query.limit(limit);
		}
		return await query;
	} catch (error) {
		console.error("Error fetching public past events:", error);
		return [];
	}
}

export async function getAllEvents() {
	await requireMember();
	try {
		const rows = await db
			.select({
				event: events,
				yesCount: sql<number>`coalesce(sum(case when ${eventRsvps.status} = 'yes' then 1 else 0 end), 0)`,
				maybeCount: sql<number>`coalesce(sum(case when ${eventRsvps.status} = 'maybe' then 1 else 0 end), 0)`,
			})
			.from(events)
			.leftJoin(eventRsvps, eq(eventRsvps.eventId, events.id))
			.groupBy(events.id)
			.orderBy(desc(events.date));

		return rows.map((r) => ({
			...r.event,
			yesCount: Number(r.yesCount),
			maybeCount: Number(r.maybeCount),
		}));
	} catch (error) {
		console.error("Error fetching all events:", error);
		return [];
	}
}

const eventInputSchema = z.object({
	title: z.string(),
	description: z.string().optional(),
	date: z.date(),
	endDate: z.date().optional(),
	location: z.string().optional(),
	type: z.string(),
	isPublic: z.boolean(),
	rsvpDeadline: z.date().nullable().optional(),
	maxAttendees: z.number().nullable().optional(),
	meetingUrl: z.string().nullable().optional(),
	createdBy: z.string().optional(),
});

const EVENT_PAGES = ["/", "/semesterprogramm", "/admin/semesterprogramm"];

export const createEvent = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([eventInputSchema]),
		revalidate: EVENT_PAGES,
		errorMessage: "Veranstaltung konnte nicht erstellt werden",
	},
	async ([input], { tenant }) => {
		await tenant.db.insert(events).values({
			title: input.title,
			description: input.description,
			date: input.date,
			endDate: input.endDate,
			location: input.location,
			type: input.type,
			isPublic: input.isPublic,
			rsvpDeadline: input.rsvpDeadline ?? null,
			maxAttendees: input.maxAttendees ?? null,
			meetingUrl: input.meetingUrl ?? null,
			createdBy: input.createdBy,
		});
	},
);

export const updateEvent = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string(), eventInputSchema.partial()]),
		revalidate: EVENT_PAGES,
		errorMessage: "Veranstaltung konnte nicht aktualisiert werden",
	},
	async ([id, input], { tenant }) => {
		await tenant.db
			.update(events)
			.set({
				...(input.title !== undefined && { title: input.title }),
				...(input.description !== undefined && {
					description: input.description,
				}),
				...(input.date !== undefined && { date: input.date }),
				...(input.endDate !== undefined && { endDate: input.endDate }),
				...(input.location !== undefined && { location: input.location }),
				...(input.type !== undefined && { type: input.type }),
				...(input.isPublic !== undefined && { isPublic: input.isPublic }),
				...(input.rsvpDeadline !== undefined && {
					rsvpDeadline: input.rsvpDeadline,
				}),
				...(input.maxAttendees !== undefined && {
					maxAttendees: input.maxAttendees,
				}),
				...(input.meetingUrl !== undefined && {
					meetingUrl: input.meetingUrl,
				}),
			})
			.where(eq(events.id, id));
	},
);

export const deleteEvent = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string()]),
		revalidate: EVENT_PAGES,
		errorMessage: "Veranstaltung konnte nicht gelöscht werden",
	},
	async ([id], { tenant }) => {
		await tenant.db.delete(events).where(eq(events.id, id));
	},
);
