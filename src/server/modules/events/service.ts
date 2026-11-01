// service.ts — the Semesterprogramm: events, RSVPs, recurring templates,
// venues, the semester config, the calendar feeds and the PDF's data (#33).
//
// Domain rules on top of ./repo. Every function takes the TenantScope it
// works in; failures the user should read are DomainErrors, anything else
// (a failed query) propagates. The dates of a recurring template come from
// domain/events/recurrence.ts, the PDF's rules from domain/events/sempro.ts.

import "server-only";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { addMonthsInTZ, dayKeyInTZ, startOfDayInTZ } from "~/lib/time";
import {
	generateOccurrences,
	recurrenceTypeSchema,
} from "~/server/domain/events/recurrence";
import {
	LEADERSHIP_ROLES,
	leadersByRank,
	type PDFData,
	recurrenceRule,
	startOfNextBerlinDay,
} from "~/server/domain/events/sempro";
import { isUniqueViolation } from "~/server/lib/db-errors";
import { ConflictError, NotFoundError } from "~/server/lib/domain-error";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

export type {
	RsvpStatus,
	SemesterConfig,
	Venue,
} from "./repo";

// ─── Events ──────────────────────────────────────────────────────────────────

/** Events from now on, soonest first. */
export function upcomingEvents(tenant: TenantScope, limit?: number) {
	return repo.upcomingEvents(tenant.db, tenant.now(), { limit });
}

/** Public events from now on, soonest first (the website). */
export function publicUpcomingEvents(tenant: TenantScope, limit?: number) {
	return repo.upcomingEvents(tenant.db, tenant.now(), {
		publicOnly: true,
		limit,
	});
}

/** Public events before now, newest first (the website). */
export function publicPastEvents(tenant: TenantScope, limit?: number) {
	return repo.publicPastEvents(tenant.db, tenant.now(), limit);
}

/** Every event, newest first, with its yes and maybe answers counted. */
export async function allEventsWithCounts({ db }: TenantScope) {
	const rows = await repo.eventsWithAnswerCounts(db);
	return rows.map((r) => ({
		...r.event,
		yesCount: Number(r.yesCount),
		maybeCount: Number(r.maybeCount),
	}));
}

export const eventInputSchema = z.object({
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

type EventInput = z.infer<typeof eventInputSchema>;

export async function createEvent({ db }: TenantScope, input: EventInput) {
	await repo.insertEvent(db, {
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
}

/** Changes only the fields given. */
export async function updateEvent(
	{ db }: TenantScope,
	eventId: string,
	input: Partial<EventInput>,
) {
	await repo.updateEvent(db, eventId, {
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
	});
}

export async function deleteEvent({ db }: TenantScope, eventId: string) {
	await repo.deleteEvent(db, eventId);
}

export async function toggleEventCancelled(
	{ db }: TenantScope,
	eventId: string,
) {
	const isCancelled = await repo.eventCancelled(db, eventId);
	if (isCancelled === null) {
		throw new NotFoundError("Veranstaltung nicht gefunden");
	}
	await repo.updateEvent(db, eventId, { isCancelled: !isCancelled });
}

// ─── RSVPs ───────────────────────────────────────────────────────────────────

export type RsvpCounts = { yes: number; no: number; maybe: number };

export type AttendeePreview = {
	userId: string;
	name: string | null;
	image: string | null;
};

export const rsvpStatusSchema = z.enum(["yes", "no", "maybe"]);

/**
 * Records the member's answer. Unknown and cancelled events and a passed
 * deadline are refused; a yes beyond the attendee limit too.
 */
export async function setRsvp(
	tenant: TenantScope,
	user: { id: string },
	eventId: string,
	status: repo.RsvpStatus,
	note?: string,
) {
	const { db } = tenant;
	const now = tenant.now();

	const event = await repo.eventForAnswer(db, eventId);
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

	const answer = { eventId, userId: user.id, note: note ?? null };
	if (status === "yes" && event.maxAttendees != null) {
		if (!(await repo.saveYesWithinLimit(db, answer, now))) {
			throw new ConflictError(
				"Die Veranstaltung ist bereits voll.",
				"CAPACITY_FULL",
			);
		}
	} else {
		await repo.saveAnswer(db, { ...answer, status }, now);
	}
}

export async function removeRsvp(
	{ db }: TenantScope,
	user: { id: string },
	eventId: string,
) {
	await repo.deleteAnswer(db, eventId, user.id);
}

/** The member's answer per event. */
export async function answersOf(
	{ db }: TenantScope,
	userId: string,
	eventIds: string[],
) {
	const rows = await repo.answersOf(db, userId, eventIds);
	return new Map(rows.map((r) => [r.eventId, r.status as repo.RsvpStatus]));
}

/** The number of each answer per event, zero for events without any. */
export async function answerCounts({ db }: TenantScope, eventIds: string[]) {
	const rows = await repo.answerCounts(db, eventIds);
	const map = new Map<string, RsvpCounts>();
	for (const id of eventIds) {
		map.set(id, { yes: 0, no: 0, maybe: 0 });
	}
	for (const r of rows) {
		const entry = map.get(r.eventId);
		if (!entry) {
			continue;
		}
		entry[r.status as repo.RsvpStatus] = r.c;
	}
	return map;
}

/** Every answer to the event, with the members' e-mail addresses. */
export function answersWithContacts({ db }: TenantScope, eventId: string) {
	return repo.answersWithContacts(db, eventId);
}

const PREVIEW_LIMIT = 4;

/** The first four members to say yes, per event. */
export async function yesPreview({ db }: TenantScope, eventIds: string[]) {
	const rows = await repo.yesAnswers(db, eventIds);
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

/** Who said yes or maybe, by answer, then name. */
export function attendees({ db }: TenantScope, eventId: string) {
	return repo.attendees(db, eventId);
}

// ─── Recurring event templates ───────────────────────────────────────────────

export const recurringEventInputSchema = z.object({
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

type RecurringEventInput = z.infer<typeof recurringEventInputSchema>;

export function listRecurringEvents({ db }: TenantScope) {
	return repo.listRecurringEvents(db);
}

export async function createRecurringEvent(
	{ db }: TenantScope,
	input: RecurringEventInput,
) {
	await repo.insertRecurringEvent(db, {
		title: input.title,
		description: input.description,
		// Always explicit, so the column's legacy DB default never applies.
		location: input.location ?? (await repo.firstVenueName(db)),
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
}

/** Changes only the fields given. */
export async function updateRecurringEvent(
	{ db }: TenantScope,
	recurringEventId: string,
	input: Partial<RecurringEventInput>,
) {
	await repo.updateRecurringEvent(db, recurringEventId, {
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
	});
}

const TEMPLATE_NOT_FOUND = "Vorlage nicht gefunden";

export async function toggleRecurringEventActive(
	{ db }: TenantScope,
	recurringEventId: string,
) {
	const isActive = await repo.recurringEventActive(db, recurringEventId);
	if (isActive === null) {
		throw new NotFoundError(TEMPLATE_NOT_FOUND);
	}
	await repo.updateRecurringEvent(db, recurringEventId, {
		isActive: !isActive,
	});
}

/** Deletes the template; the events it generated stay. */
export async function deleteRecurringEvent(
	{ db }: TenantScope,
	recurringEventId: string,
) {
	await repo.deleteRecurringEvent(db, recurringEventId);
}

/** Adds the template's missing occurrences; answers how many it created. */
export async function generateInstances(
	tenant: TenantScope,
	recurringEventId: string,
): Promise<{ created: number }> {
	const { db } = tenant;
	const template = await repo.recurringEvent(db, recurringEventId);
	if (!template) {
		throw new NotFoundError(TEMPLATE_NOT_FOUND);
	}

	// Deduplicate by Berlin calendar day
	const existingDays = new Set(
		(await repo.generatedEventDates(db, recurringEventId)).map((date) =>
			dayKeyInTZ(date),
		),
	);

	// Default range: today → +6 months (fallback if no startDate/endDate)
	const now = tenant.now();
	const defaultFrom = startOfDayInTZ(now);
	// Same Berlin wall-clock time six months on, also across a DST switch.
	const defaultTo = addMonthsInTZ(now, 6);

	const newItems = generateOccurrences(template, defaultFrom, defaultTo).filter(
		(item) => !existingDays.has(dayKeyInTZ(item.date)),
	);
	if (newItems.length === 0) {
		return { created: 0 };
	}

	await repo.insertEvents(
		db,
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
}

// ─── Venues ──────────────────────────────────────────────────────────────────

export function listVenues({ db }: TenantScope) {
	return repo.listVenues(db);
}

const SHORT_NAME_TAKEN = "Kurzname bereits vergeben";

/** Runs `write`; a duplicate short name is the user's mistake, not a crash. */
async function saveVenue(write: () => Promise<unknown>) {
	try {
		await write();
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new ConflictError(SHORT_NAME_TAKEN, "SHORT_NAME_TAKEN");
		}
		throw error;
	}
}

export async function createVenue(
	{ db }: TenantScope,
	shortName: string,
	fullAddress: string,
) {
	await saveVenue(() => repo.insertVenue(db, { shortName, fullAddress }));
}

export async function updateVenue(
	{ db }: TenantScope,
	venueId: string,
	shortName: string,
	fullAddress: string,
) {
	await saveVenue(() =>
		repo.updateVenue(db, venueId, { shortName, fullAddress }),
	);
}

export async function deleteVenue({ db }: TenantScope, venueId: string) {
	await repo.deleteVenue(db, venueId);
}

// ─── The semester config ─────────────────────────────────────────────────────

export const semesterConfigSchema = z.object({
	name: z.string(),
	startDate: z.date(),
	endDate: z.date(),
});

/** The semester's name and dates, or null until they are saved. */
export function semesterConfig({ db }: TenantScope) {
	return repo.semesterConfigRow(db);
}

export async function saveSemesterConfig(
	{ db }: TenantScope,
	input: z.infer<typeof semesterConfigSchema>,
) {
	await repo.saveSemesterConfig(db, {
		name: input.name,
		startDate: input.startDate,
		endDate: input.endDate,
	});
}

// ─── Calendar feeds ──────────────────────────────────────────────────────────

function newCalendarToken() {
	return randomBytes(24).toString("base64url");
}

/** The member's personal feed token, created on first use. */
export async function calendarTokenFor({ db }: TenantScope, userId: string) {
	const existing = await repo.calendarTokenOf(db, userId);
	if (existing) {
		return existing;
	}
	const token = newCalendarToken();
	await repo.insertCalendarToken(db, userId, token);
	return token;
}

/** Replaces the member's feed token; old subscription links stop working. */
export async function rotateCalendarToken({ db }: TenantScope, userId: string) {
	await repo.deleteCalendarTokens(db, userId);
	const token = newCalendarToken();
	await repo.insertCalendarToken(db, userId, token);
	return token;
}

/** The public events (date order) and the venues: the public feed. */
export async function publicCalendar({ db }: TenantScope) {
	// Public feed: public events only. Members get everything through
	// their personal token feed (/api/calendar/[token]).
	const [rows, venueRows] = await Promise.all([
		repo.publicEvents(db),
		repo.allVenues(db),
	]);
	return { events: rows, venues: venueRows };
}

/**
 * The member a personal feed token belongs to, or null if the token is
 * unknown in this tenant. Records the token's last use.
 */
export async function calendarOwner(tenant: TenantScope, token: string) {
	const owner = await repo.calendarTokenOwner(tenant.db, token);
	if (owner) {
		await repo.touchCalendarToken(tenant.db, token, tenant.now());
	}
	return owner;
}

/** Every event (date order), venue and RSVP: the personal feed. */
export async function memberCalendar({ db }: TenantScope) {
	const [rows, venueRows, rsvps] = await Promise.all([
		repo.allEvents(db),
		repo.allVenues(db),
		repo.allAnswersWithUsers(db),
	]);
	return { events: rows, venues: venueRows, rsvps };
}

// ─── The Semesterprogramm PDF ────────────────────────────────────────────────

/**
 * What the Semesterprogramm PDF shows, or null until the semester's name and
 * dates are saved.
 */
export async function semproPdfData({
	db,
}: TenantScope): Promise<PDFData | null> {
	const config = await repo.semesterConfigRow(db);
	if (!config?.startDate || !config?.endDate || !config.name) {
		return null;
	}

	const leaders = leadersByRank(await repo.holdersOf(db, LEADERSHIP_ROLES));
	const ccKonto = await repo.activeCcKasseAccount(db);
	const recurring = await repo.allRecurringEvents(db);
	// The end date is the picked last day at Berlin midnight, so everything
	// before the following midnight belongs in.
	const semEvents = await repo.eventsBetween(
		db,
		config.startDate,
		startOfNextBerlinDay(config.endDate),
	);

	return {
		semesterName: config.name,
		startDate: config.startDate,
		endDate: config.endDate,
		leaders,
		ccKonto,
		jourFixeRule: recurrenceRule(recurring, "Jour Fix"),
		stammtischRule: recurrenceRule(recurring, "Stammtisch"),
		events: semEvents.map((e) => ({
			date: e.date,
			endDate: e.endDate,
			title: e.title,
			location: e.location,
			type: e.type,
			isPublic: e.isPublic,
			isCancelled: e.isCancelled,
		})),
	};
}
