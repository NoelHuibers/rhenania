"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { events, recurringEvents } from "~/server/db/schema";

export type RecurrenceType =
	| "biweekly"
	| "monthly_1st_wednesday"
	| "monthly_1st_3rd_wednesday"
	| "occ_semester";

export type RecurringEventInput = {
	title: string;
	description?: string;
	location?: string;
	type:
		| "Intern"
		| "AHV"
		| "oCC"
		| "SC"
		| "Jour Fix"
		| "Stammtisch"
		| "Sonstige";
	recurrenceType: RecurrenceType;
	dayOfWeek?: number;
	time: string;
	isPublic?: boolean;
	startDate?: Date;
	endDate?: Date;
	createdBy?: string;
};

// --- Date helpers ---

const MS_DAY = 24 * 60 * 60 * 1000;
const MS_2_WEEKS = 14 * MS_DAY;

function setTime(date: Date, time: string): Date {
	const [h, m] = time.split(":").map(Number);
	const d = new Date(date);
	d.setHours(h ?? 0, m ?? 0, 0, 0);
	return d;
}

function nextDayOfWeek(from: Date, dow: number): Date {
	const d = new Date(from);
	d.setHours(0, 0, 0, 0);
	const diff = (dow - d.getDay() + 7) % 7;
	d.setDate(d.getDate() + diff);
	return d;
}

function firstWednesdayOfMonth(year: number, month: number): Date {
	return nextDayOfWeek(new Date(year, month, 1), 3);
}

function thirdWednesdayOfMonth(year: number, month: number): Date {
	const first = firstWednesdayOfMonth(year, month);
	return new Date(first.getTime() + 14 * MS_DAY);
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
		start = new Date(start.getTime() - MS_2_WEEKS);
	}
	// Walk forward to first occurrence >= fromDate
	while (start < fromDate) {
		start = new Date(start.getTime() + MS_2_WEEKS);
	}
	const items: OccurrenceItem[] = [];
	let current = new Date(start);
	while (current <= toDate) {
		items.push({ date: setTime(current, time) });
		current = new Date(current.getTime() + MS_2_WEEKS);
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
	let year = fromDate.getFullYear();
	let month = fromDate.getMonth();
	while (true) {
		const first = setTime(firstWednesdayOfMonth(year, month), time);
		if (first > toDate) break;
		if (first >= fromDate) items.push({ date: first });
		if (which === "1st_3rd") {
			const third = setTime(thirdWednesdayOfMonth(year, month), time);
			if (third <= toDate && third >= fromDate) items.push({ date: third });
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
	let current = new Date(startDate);
	current.setHours(0, 0, 0, 0);
	while (current <= endDate) {
		sundays.push(new Date(current));
		current = new Date(current.getTime() + MS_2_WEEKS);
	}

	if (sundays.length === 0) return [];

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
		const monday = new Date(sunday.getTime() + MS_DAY);
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
			if (!template.startDate || !template.endDate) return [];
			return generateOCCSemester(template.startDate, template.endDate);
		}
		default:
			return [];
	}
}

// --- CRUD ---

export async function getAllRecurringEvents() {
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

export async function createRecurringEvent(input: RecurringEventInput) {
	try {
		await db.insert(recurringEvents).values({
			title: input.title,
			description: input.description,
			location: input.location ?? "adH Rhenania",
			type: input.type,
			recurrenceType: input.recurrenceType,
			dayOfWeek: input.dayOfWeek,
			time: input.time,
			isPublic: input.isPublic ?? true,
			startDate: input.startDate,
			endDate: input.endDate,
			createdBy: input.createdBy,
		});
		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch (error) {
		console.error("Error creating recurring event:", error);
		return { success: false, error: "Konnte nicht erstellt werden" };
	}
}

export async function updateRecurringEvent(
	id: string,
	input: Partial<RecurringEventInput>,
) {
	try {
		await db
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
				...(input.startDate !== undefined && { startDate: input.startDate }),
				...(input.endDate !== undefined && { endDate: input.endDate }),
			})
			.where(eq(recurringEvents.id, id));
		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch (error) {
		console.error("Error updating recurring event:", error);
		return { success: false, error: "Konnte nicht aktualisiert werden" };
	}
}

export async function toggleRecurringEventActive(id: string) {
	try {
		const [current] = await db
			.select({ isActive: recurringEvents.isActive })
			.from(recurringEvents)
			.where(eq(recurringEvents.id, id))
			.limit(1);
		if (!current) return { success: false, error: "Nicht gefunden" };
		await db
			.update(recurringEvents)
			.set({ isActive: !current.isActive })
			.where(eq(recurringEvents.id, id));
		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch (error) {
		console.error("Error toggling recurring event:", error);
		return { success: false, error: "Fehler aufgetreten" };
	}
}

export async function deleteRecurringEvent(id: string) {
	try {
		await db.delete(recurringEvents).where(eq(recurringEvents.id, id));
		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch (error) {
		console.error("Error deleting recurring event:", error);
		return { success: false, error: "Konnte nicht gelöscht werden" };
	}
}

export async function generateInstances(recurringEventId: string) {
	try {
		const [template] = await db
			.select()
			.from(recurringEvents)
			.where(eq(recurringEvents.id, recurringEventId))
			.limit(1);

		if (!template) return { success: false, error: "Vorlage nicht gefunden" };

		const existing = await db
			.select({ date: events.date })
			.from(events)
			.where(eq(events.recurringEventId, recurringEventId));

		// Deduplicate by day (allow ±0 day tolerance)
		const existingDays = new Set(
			existing.map((e) => Math.floor(e.date.getTime() / MS_DAY)),
		);

		// Default range: today → +6 months (fallback if no startDate/endDate)
		const defaultFrom = new Date();
		defaultFrom.setHours(0, 0, 0, 0);
		const defaultTo = new Date();
		defaultTo.setMonth(defaultTo.getMonth() + 6);

		const items = generateOccurrences(template, defaultFrom, defaultTo);

		const newItems = items.filter(
			(item) => !existingDays.has(Math.floor(item.date.getTime() / MS_DAY)),
		);

		if (newItems.length === 0) return { success: true, created: 0 };

		await db.insert(events).values(
			newItems.map((item) => ({
				title: item.title ?? template.title,
				description: template.description,
				date: item.date,
				location: template.location,
				type: template.type,
				isPublic: template.isPublic,
				isCancelled: false,
				recurringEventId: template.id,
				createdBy: template.createdBy,
			})),
		);

		revalidatePath("/");
		revalidatePath("/semesterprogramm");
		revalidatePath("/admin/semesterprogramm");
		return { success: true, created: newItems.length };
	} catch (error) {
		console.error("Error generating instances:", error);
		return { success: false, error: "Fehler beim Generieren" };
	}
}

export async function toggleEventCancelled(eventId: string) {
	try {
		const [current] = await db
			.select({ isCancelled: events.isCancelled })
			.from(events)
			.where(eq(events.id, eventId))
			.limit(1);
		if (!current) return { success: false, error: "Nicht gefunden" };
		await db
			.update(events)
			.set({ isCancelled: !current.isCancelled })
			.where(eq(events.id, eventId));
		revalidatePath("/");
		revalidatePath("/semesterprogramm");
		revalidatePath("/admin/semesterprogramm");
		return { success: true };
	} catch (error) {
		console.error("Error toggling cancelled:", error);
		return { success: false, error: "Fehler aufgetreten" };
	}
}
