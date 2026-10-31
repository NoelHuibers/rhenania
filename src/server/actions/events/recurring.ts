"use server";

import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
	addDaysInTZ,
	addMonthsInTZ,
	dayKeyInTZ,
	getZonedParts,
	startOfDayInTZ,
	wallClockToUTC,
} from "~/lib/time";
import { db } from "~/server/db";
import { events, recurringEvents, venues } from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";
import { ROLES, requireRole } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { NotFoundError } from "~/server/lib/domain-error";

const recurrenceTypeSchema = z.enum([
	"biweekly",
	"monthly_1st_wednesday",
	"monthly_1st_3rd_wednesday",
	"occ_semester",
]);

export type RecurrenceType = z.infer<typeof recurrenceTypeSchema>;

const recurringEventInputSchema = z.object({
	title: z.string(),
	description: z.string().optional(),
	location: z.string().optional(),
	// Per-tenant configurable; valid values come from the `event_type` table.
	type: z.string(),
	recurrenceType: recurrenceTypeSchema,
	dayOfWeek: z.number().int().optional(),
	time: z.string(),
	isPublic: z.boolean().optional(),
	meetingUrl: z.string().nullable().optional(),
	startDate: z.date().optional(),
	endDate: z.date().optional(),
	createdBy: z.string().optional(),
});

// --- Date helpers ---
//
// Days are Europe/Berlin calendar days, represented by the instant of their
// Berlin midnight and stepped with addDaysInTZ, so DST days (23 h or 25 h)
// still count as one day. Times are Berlin wall-clock times. Nothing here
// depends on the server's time zone.

/** The Berlin wall-clock `time` ("HH:MM") on the Berlin day containing `day`. */
function setTime(day: Date, time: string): Date {
	const [h, m] = time.split(":").map(Number);
	const pad = (n: number) => String(n).padStart(2, "0");
	return wallClockToUTC(`${dayKeyInTZ(day)}T${pad(h ?? 0)}:${pad(m ?? 0)}`);
}

/** Start of the first Berlin day on or after `from` that falls on `dow`. */
function nextDayOfWeek(from: Date, dow: number): Date {
	const { weekday } = getZonedParts(from);
	return addDaysInTZ(from, (dow - weekday + 7) % 7);
}

/** `month` is 0-based, like Date#getMonth. */
function firstWednesdayOfMonth(year: number, month: number): Date {
	const first = `${year}-${String(month + 1).padStart(2, "0")}-01`;
	return nextDayOfWeek(wallClockToUTC(first), 3);
}

function thirdWednesdayOfMonth(year: number, month: number): Date {
	return addDaysInTZ(firstWednesdayOfMonth(year, month), 14);
}

// --- Generation per recurrence type ---

type OccurrenceItem = { date: Date; title?: string };

function generateBiweekly(
	anchor: Date,
	dow: number,
	time: string,
	fromDate: Date,
	toDate: Date,
): OccurrenceItem[] {
	// Normalise anchor to the correct day of week
	let start = nextDayOfWeek(anchor, dow);
	// Walk back until start <= fromDate
	while (start > fromDate) {
		start = addDaysInTZ(start, -14);
	}
	// Walk forward to first occurrence >= fromDate
	while (start < fromDate) {
		start = addDaysInTZ(start, 14);
	}
	const items: OccurrenceItem[] = [];
	let current = start;
	while (current <= toDate) {
		items.push({ date: setTime(current, time) });
		current = addDaysInTZ(current, 14);
	}
	return items;
}

function generateMonthlyWednesdays(
	which: "1st" | "1st_3rd",
	time: string,
	fromDate: Date,
	toDate: Date,
): OccurrenceItem[] {
	const items: OccurrenceItem[] = [];
	const from = getZonedParts(fromDate);
	let year = from.year;
	let month = from.month - 1;
	while (true) {
		const first = setTime(firstWednesdayOfMonth(year, month), time);
		if (first > toDate) {
			break;
		}
		if (first >= fromDate) {
			items.push({ date: first });
		}
		if (which === "1st_3rd") {
			const third = setTime(thirdWednesdayOfMonth(year, month), time);
			if (third <= toDate && third >= fromDate) {
				items.push({ date: third });
			}
		}
		month++;
		if (month > 11) {
			month = 0;
			year++;
		}
	}
	return items;
}

/**
 * oCC semester: AnCC (Sunday 18:00), numbered Mondays (20:00), AbCC (Sunday 18:00).
 * startDate must be a Sunday (AnCC date).
 * endDate defines the last Sunday (AbCC).
 */
function generateOCCSemester(startDate: Date, endDate: Date): OccurrenceItem[] {
	// Collect biweekly Sundays from startDate to endDate
	const sundays: Date[] = [];
	let current = startOfDayInTZ(startDate);
	while (current <= endDate) {
		sundays.push(current);
		current = addDaysInTZ(current, 14);
	}

	if (sundays.length === 0) {
		return [];
	}

	return sundays.map((sunday, i) => {
		const isFirst = i === 0;
		const isLast = i === sundays.length - 1;

		if (isFirst) {
			return { date: setTime(sunday, "18:00"), title: "AnCC" };
		}
		if (isLast && sundays.length > 1) {
			return { date: setTime(sunday, "18:00"), title: "AbCC" };
		}
		// Middle: shift to Monday 20:00
		const monday = addDaysInTZ(sunday, 1);
		return { date: setTime(monday, "20:00"), title: `${i + 1}. oCC` };
	});
}

function generateOccurrences(
	template: {
		recurrenceType: RecurrenceType;
		dayOfWeek?: number | null;
		time: string;
		startDate?: Date | null;
		endDate?: Date | null;
	},
	defaultFromDate: Date,
	defaultToDate: Date,
): OccurrenceItem[] {
	const fromDate = template.startDate ?? defaultFromDate;
	const toDate = template.endDate ?? defaultToDate;

	switch (template.recurrenceType) {
		case "biweekly": {
			// startDate serves as the anchor for the biweekly cadence
			return generateBiweekly(
				fromDate,
				template.dayOfWeek ?? 1,
				template.time,
				fromDate,
				toDate,
			);
		}
		case "monthly_1st_wednesday":
			return generateMonthlyWednesdays("1st", template.time, fromDate, toDate);
		case "monthly_1st_3rd_wednesday":
			return generateMonthlyWednesdays(
				"1st_3rd",
				template.time,
				fromDate,
				toDate,
			);
		case "occ_semester": {
			if (!template.startDate || !template.endDate) {
				return [];
			}
			return generateOCCSemester(template.startDate, template.endDate);
		}
		default:
			return [];
	}
}

// --- CRUD ---

export async function getAllRecurringEvents() {
	await requireRole(ROLES.events);
	try {
		return await db
			.select()
			.from(recurringEvents)
			.orderBy(recurringEvents.startDate);
	} catch (error) {
		console.error("Error fetching recurring events:", error);
		return [];
	}
}

/** The tenant's first venue, or null when it has none yet. */
async function firstVenueName(db: TenantDb): Promise<string | null> {
	const [venue] = await db
		.select({ shortName: venues.shortName })
		.from(venues)
		.orderBy(asc(venues.createdAt), sql`rowid`)
		.limit(1);
	return venue?.shortName ?? null;
}

const EVENT_PAGES = ["/", "/semesterprogramm", "/admin/semesterprogramm"];

export const createRecurringEvent = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([recurringEventInputSchema]),
		revalidate: ["/admin/semesterprogramm"],
		errorMessage: "Konnte nicht erstellt werden",
	},
	async ([input], { tenant }) => {
		await tenant.db.insert(recurringEvents).values({
			title: input.title,
			description: input.description,
			// Always explicit, so the column's legacy DB default never applies.
			location: input.location ?? (await firstVenueName(tenant.db)),
			type: input.type,
			recurrenceType: input.recurrenceType,
			dayOfWeek: input.dayOfWeek,
			time: input.time,
			isPublic: input.isPublic ?? true,
			meetingUrl: input.meetingUrl ?? null,
			startDate: input.startDate,
			endDate: input.endDate,
			createdBy: input.createdBy,
		});
	},
);

export const updateRecurringEvent = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string(), recurringEventInputSchema.partial()]),
		revalidate: ["/admin/semesterprogramm"],
		errorMessage: "Konnte nicht aktualisiert werden",
	},
	async ([id, input], { tenant }) => {
		await tenant.db
			.update(recurringEvents)
			.set({
				...(input.title !== undefined && { title: input.title }),
				...(input.description !== undefined && {
					description: input.description,
				}),
				...(input.location !== undefined && { location: input.location }),
				...(input.type !== undefined && { type: input.type }),
				...(input.recurrenceType !== undefined && {
					recurrenceType: input.recurrenceType,
				}),
				...(input.dayOfWeek !== undefined && { dayOfWeek: input.dayOfWeek }),
				...(input.time !== undefined && { time: input.time }),
				...(input.isPublic !== undefined && { isPublic: input.isPublic }),
				...(input.meetingUrl !== undefined && {
					meetingUrl: input.meetingUrl,
				}),
				...(input.startDate !== undefined && { startDate: input.startDate }),
				...(input.endDate !== undefined && { endDate: input.endDate }),
			})
			.where(eq(recurringEvents.id, id));
	},
);

const TEMPLATE_NOT_FOUND = "Vorlage nicht gefunden";

export const toggleRecurringEventActive = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string()]),
		revalidate: ["/admin/semesterprogramm"],
		errorMessage: "Fehler aufgetreten",
	},
	async ([id], { tenant }) => {
		const [current] = await tenant.db
			.select({ isActive: recurringEvents.isActive })
			.from(recurringEvents)
			.where(eq(recurringEvents.id, id))
			.limit(1);
		if (!current) {
			throw new NotFoundError(TEMPLATE_NOT_FOUND);
		}
		await tenant.db
			.update(recurringEvents)
			.set({ isActive: !current.isActive })
			.where(eq(recurringEvents.id, id));
	},
);

export const deleteRecurringEvent = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string()]),
		revalidate: ["/admin/semesterprogramm"],
		errorMessage: "Konnte nicht gelöscht werden",
	},
	async ([id], { tenant }) => {
		await tenant.db.delete(recurringEvents).where(eq(recurringEvents.id, id));
	},
);

/** Adds the template's missing occurrences; answers how many it created. */
export const generateInstances = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string()]),
		revalidate: EVENT_PAGES,
		errorMessage: "Fehler beim Generieren",
	},
	async ([recurringEventId], { tenant }) => {
		const { db } = tenant;
		const [template] = await db
			.select()
			.from(recurringEvents)
			.where(eq(recurringEvents.id, recurringEventId))
			.limit(1);

		if (!template) {
			throw new NotFoundError(TEMPLATE_NOT_FOUND);
		}

		const existing = await db
			.select({ date: events.date })
			.from(events)
			.where(eq(events.recurringEventId, recurringEventId));

		// Deduplicate by Berlin calendar day
		const existingDays = new Set(existing.map((e) => dayKeyInTZ(e.date)));

		// Default range: today → +6 months (fallback if no startDate/endDate)
		const now = tenant.now();
		const defaultFrom = startOfDayInTZ(now);
		// Same Berlin wall-clock time six months on, also across a DST switch.
		const defaultTo = addMonthsInTZ(now, 6);

		const items = generateOccurrences(template, defaultFrom, defaultTo);

		const newItems = items.filter(
			(item) => !existingDays.has(dayKeyInTZ(item.date)),
		);

		if (newItems.length === 0) {
			return { created: 0 };
		}

		await db.insert(events).values(
			newItems.map((item) => ({
				title: item.title ?? template.title,
				description: template.description,
				date: item.date,
				location: template.location,
				type: template.type,
				isPublic: template.isPublic,
				isCancelled: false,
				meetingUrl: template.meetingUrl,
				recurringEventId: template.id,
				createdBy: template.createdBy,
			})),
		);

		return { created: newItems.length };
	},
);

export const toggleEventCancelled = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string()]),
		revalidate: EVENT_PAGES,
		errorMessage: "Fehler aufgetreten",
	},
	async ([eventId], { tenant }) => {
		const [current] = await tenant.db
			.select({ isCancelled: events.isCancelled })
			.from(events)
			.where(eq(events.id, eventId))
			.limit(1);
		if (!current) {
			throw new NotFoundError("Veranstaltung nicht gefunden");
		}
		await tenant.db
			.update(events)
			.set({ isCancelled: !current.isCancelled })
			.where(eq(events.id, eventId));
	},
);
