"use server";

import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { eventRsvps, events } from "~/server/db/schema";

export type EventType =
	| "Intern"
	| "AHV"
	| "oCC"
	| "SC"
	| "Jour Fix"
	| "Stammtisch"
	| "Sonstige";

export type EventInput = {
	title: string;
	description?: string;
	date: Date;
	endDate?: Date;
	location?: string;
	type: EventType;
	isPublic: boolean;
	rsvpDeadline?: Date | null;
	maxAttendees?: number | null;
	meetingUrl?: string | null;
	createdBy?: string;
};

export async function getUpcomingEvents(limit?: number) {
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

export async function getAllEvents() {
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

export async function getEventById(id: string) {
	try {
		const result = await db
			.select()
			.from(events)
			.where(eq(events.id, id))
			.limit(1);
		return result[0] ?? null;
	} catch (error) {
		console.error("Error fetching event:", error);
		return null;
	}
}

export async function createEvent(input: EventInput) {
	try {
		await db.insert(events).values({
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

		revalidatePath("/");
		revalidatePath("/semesterprogramm");
		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch (error) {
		console.error("Error creating event:", error);
		return {
			success: false,
			error: "Veranstaltung konnte nicht erstellt werden",
		};
	}
}

export async function updateEvent(id: string, input: Partial<EventInput>) {
	try {
		await db
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

		revalidatePath("/");
		revalidatePath("/semesterprogramm");
		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch (error) {
		console.error("Error updating event:", error);
		return {
			success: false,
			error: "Veranstaltung konnte nicht aktualisiert werden",
		};
	}
}

export async function deleteEvent(id: string) {
	try {
		await db.delete(events).where(eq(events.id, id));

		revalidatePath("/");
		revalidatePath("/semesterprogramm");
		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch (error) {
		console.error("Error deleting event:", error);
		return {
			success: false,
			error: "Veranstaltung konnte nicht gelöscht werden",
		};
	}
}
