// repo.ts — the Semesterprogramm in the tenant DB (#33).
//
// Drizzle reads and writes of events, RSVPs, recurring event templates,
// venues, the semester config and the calendar feed tokens, plus what the
// Semesterprogramm PDF reads. Every function takes the database it runs on;
// none checks the caller, applies a rule or revalidates a page. A read that
// may find nothing returns null or []; a failed query throws.

import "server-only";

import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	inArray,
	lt,
	ne,
	sql,
} from "drizzle-orm";
import {
	calendarTokens,
	eventRsvps,
	events,
	kontos,
	recurringEvents,
	roles,
	semesterConfig,
	userRoles,
	users,
	venues,
} from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";

export type Event = typeof events.$inferSelect;
export type EventInsert = typeof events.$inferInsert;
export type RecurringEvent = typeof recurringEvents.$inferSelect;
export type RecurringEventInsert = typeof recurringEvents.$inferInsert;
export type Venue = typeof venues.$inferSelect;
export type SemesterConfig = typeof semesterConfig.$inferSelect;
export type RsvpStatus = "yes" | "no" | "maybe";

// ─── Events ──────────────────────────────────────────────────────────────────

/** Events from `from` on, soonest first; public ones only if asked. */
export async function upcomingEvents(
	db: TenantDb,
	from: Date,
	opts: { publicOnly?: boolean; limit?: number } = {},
): Promise<Event[]> {
	const query = db
		.select()
		.from(events)
		.where(
			opts.publicOnly
				? and(gte(events.date, from), eq(events.isPublic, true))
				: gte(events.date, from),
		)
		.orderBy(asc(events.date));
	return opts.limit ? query.limit(opts.limit) : query;
}

/** Public events before `before`, newest first. */
export async function publicPastEvents(
	db: TenantDb,
	before: Date,
	limit?: number,
): Promise<Event[]> {
	const query = db
		.select()
		.from(events)
		.where(and(lt(events.date, before), eq(events.isPublic, true)))
		.orderBy(desc(events.date));
	return limit ? query.limit(limit) : query;
}

/** Every event, newest first, with its yes and maybe answers counted. */
export async function eventsWithAnswerCounts(db: TenantDb) {
	return db
		.select({
			event: events,
			yesCount: sql<number>`coalesce(sum(case when ${eventRsvps.status} = 'yes' then 1 else 0 end), 0)`,
			maybeCount: sql<number>`coalesce(sum(case when ${eventRsvps.status} = 'maybe' then 1 else 0 end), 0)`,
		})
		.from(events)
		.leftJoin(eventRsvps, eq(eventRsvps.eventId, events.id))
		.groupBy(events.id)
		.orderBy(desc(events.date));
}

/** Every event in date order (the personal calendar feed). */
export async function allEvents(db: TenantDb): Promise<Event[]> {
	return db.select().from(events).orderBy(asc(events.date));
}

/** The public events in date order (the public calendar feed). */
export async function publicEvents(db: TenantDb): Promise<Event[]> {
	return db
		.select()
		.from(events)
		.where(eq(events.isPublic, true))
		.orderBy(asc(events.date));
}

/** Events from `from` (inclusive) to `to` (exclusive), in date order. */
export async function eventsBetween(
	db: TenantDb,
	from: Date,
	to: Date,
): Promise<Event[]> {
	return db
		.select()
		.from(events)
		.where(and(gte(events.date, from), lt(events.date, to)))
		.orderBy(asc(events.date));
}

export async function insertEvent(db: TenantDb, values: EventInsert) {
	await db.insert(events).values(values);
}

export async function insertEvents(db: TenantDb, values: EventInsert[]) {
	await db.insert(events).values(values);
}

export async function updateEvent(
	db: TenantDb,
	eventId: string,
	patch: Partial<EventInsert>,
) {
	await db.update(events).set(patch).where(eq(events.id, eventId));
}

export async function deleteEvent(db: TenantDb, eventId: string) {
	await db.delete(events).where(eq(events.id, eventId));
}

/** Whether the event is cancelled, or null if there is no such event. */
export async function eventCancelled(
	db: TenantDb,
	eventId: string,
): Promise<boolean | null> {
	const [row] = await db
		.select({ isCancelled: events.isCancelled })
		.from(events)
		.where(eq(events.id, eventId))
		.limit(1);
	return row ? row.isCancelled : null;
}

/** What answering an event depends on, or null if there is no such event. */
export async function eventForAnswer(db: TenantDb, eventId: string) {
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
	return event ?? null;
}

/** The days of the events generated from a template. */
export async function generatedEventDates(
	db: TenantDb,
	recurringEventId: string,
): Promise<Date[]> {
	const rows = await db
		.select({ date: events.date })
		.from(events)
		.where(eq(events.recurringEventId, recurringEventId));
	return rows.map((r) => r.date);
}

// ─── RSVPs ───────────────────────────────────────────────────────────────────

type Answer = {
	eventId: string;
	userId: string;
	status: RsvpStatus;
	note: string | null;
};

/** Stores the member's answer, replacing an earlier one. */
export async function saveAnswer(db: TenantDb, answer: Answer, now: Date) {
	await db
		.insert(eventRsvps)
		.values(answer)
		.onConflictDoUpdate(answerConflict(answer, now));
}

function answerConflict(answer: Answer, now: Date) {
	return {
		target: [eventRsvps.eventId, eventRsvps.userId],
		set: { status: answer.status, note: answer.note, updatedAt: now },
	};
}

/**
 * Stores a "yes" only while other members' yes answers are still below the
 * event's attendee limit; false if the event is full. Check and write are
 * ONE statement, so simultaneous yes answers cannot both pass the check
 * before either is stored. An existing yes of the same member is not
 * counted, so re-confirming always succeeds.
 */
export async function saveYesWithinLimit(
	db: TenantDb,
	answer: Omit<Answer, "status">,
	now: Date,
): Promise<boolean> {
	const { eventId, userId, note } = answer;
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
	const row = db
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
	const saved = await db
		.insert(eventRsvps)
		.select(row)
		.onConflictDoUpdate(answerConflict({ ...answer, status: "yes" }, now))
		.returning({ id: eventRsvps.id });
	return saved.length > 0;
}

export async function deleteAnswer(
	db: TenantDb,
	eventId: string,
	userId: string,
) {
	await db
		.delete(eventRsvps)
		.where(and(eq(eventRsvps.eventId, eventId), eq(eventRsvps.userId, userId)));
}

/** The member's answers to the given events. */
export async function answersOf(
	db: TenantDb,
	userId: string,
	eventIds: string[],
) {
	return db
		.select({ eventId: eventRsvps.eventId, status: eventRsvps.status })
		.from(eventRsvps)
		.where(
			and(eq(eventRsvps.userId, userId), inArray(eventRsvps.eventId, eventIds)),
		);
}

/** How many members gave each answer, per event and answer. */
export async function answerCounts(db: TenantDb, eventIds: string[]) {
	return db
		.select({
			eventId: eventRsvps.eventId,
			status: eventRsvps.status,
			c: count(),
		})
		.from(eventRsvps)
		.where(inArray(eventRsvps.eventId, eventIds))
		.groupBy(eventRsvps.eventId, eventRsvps.status);
}

/** Every answer to the event with the member's name and e-mail address. */
export async function answersWithContacts(db: TenantDb, eventId: string) {
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

/** The yes answers to the given events, first answer first. */
export async function yesAnswers(db: TenantDb, eventIds: string[]) {
	return db
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
}

/** Who said yes or maybe, by answer, then name. */
export async function attendees(db: TenantDb, eventId: string) {
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

/** Every answer with the member's name and address (the personal feed). */
export async function allAnswersWithUsers(db: TenantDb) {
	return db
		.select({
			eventId: eventRsvps.eventId,
			userId: eventRsvps.userId,
			status: eventRsvps.status,
			userName: users.name,
			userEmail: users.email,
			createdAt: eventRsvps.createdAt,
			updatedAt: eventRsvps.updatedAt,
		})
		.from(eventRsvps)
		.innerJoin(users, eq(eventRsvps.userId, users.id));
}

// ─── Recurring event templates ───────────────────────────────────────────────

/** Every template, by start date. */
export async function listRecurringEvents(
	db: TenantDb,
): Promise<RecurringEvent[]> {
	return db.select().from(recurringEvents).orderBy(recurringEvents.startDate);
}

/** Every template, unordered (the PDF's rule texts). */
export async function allRecurringEvents(
	db: TenantDb,
): Promise<RecurringEvent[]> {
	return db.select().from(recurringEvents);
}

export async function recurringEvent(
	db: TenantDb,
	recurringEventId: string,
): Promise<RecurringEvent | null> {
	const [template] = await db
		.select()
		.from(recurringEvents)
		.where(eq(recurringEvents.id, recurringEventId))
		.limit(1);
	return template ?? null;
}

/** Whether the template is active, or null if there is no such template. */
export async function recurringEventActive(
	db: TenantDb,
	recurringEventId: string,
): Promise<boolean | null> {
	const [row] = await db
		.select({ isActive: recurringEvents.isActive })
		.from(recurringEvents)
		.where(eq(recurringEvents.id, recurringEventId))
		.limit(1);
	return row ? row.isActive : null;
}

export async function insertRecurringEvent(
	db: TenantDb,
	values: RecurringEventInsert,
) {
	await db.insert(recurringEvents).values(values);
}

export async function updateRecurringEvent(
	db: TenantDb,
	recurringEventId: string,
	patch: Partial<RecurringEventInsert>,
) {
	await db
		.update(recurringEvents)
		.set(patch)
		.where(eq(recurringEvents.id, recurringEventId));
}

export async function deleteRecurringEvent(
	db: TenantDb,
	recurringEventId: string,
) {
	await db
		.delete(recurringEvents)
		.where(eq(recurringEvents.id, recurringEventId));
}

// ─── Venues ──────────────────────────────────────────────────────────────────

/** Every venue by short name. */
export async function listVenues(db: TenantDb): Promise<Venue[]> {
	return db.select().from(venues).orderBy(asc(venues.shortName));
}

/** Every venue, unordered (the calendar feeds resolve addresses). */
export async function allVenues(db: TenantDb): Promise<Venue[]> {
	return db.select().from(venues);
}

/** The short name of the tenant's first venue, or null when it has none. */
export async function firstVenueName(db: TenantDb): Promise<string | null> {
	const [venue] = await db
		.select({ shortName: venues.shortName })
		.from(venues)
		.orderBy(asc(venues.createdAt), sql`rowid`)
		.limit(1);
	return venue?.shortName ?? null;
}

export async function insertVenue(
	db: TenantDb,
	values: { shortName: string; fullAddress: string },
) {
	await db.insert(venues).values(values);
}

export async function updateVenue(
	db: TenantDb,
	venueId: string,
	values: { shortName: string; fullAddress: string },
) {
	await db.update(venues).set(values).where(eq(venues.id, venueId));
}

export async function deleteVenue(db: TenantDb, venueId: string) {
	await db.delete(venues).where(eq(venues.id, venueId));
}

// ─── The semester config ─────────────────────────────────────────────────────

const SEMESTER_CONFIG_ID = "singleton";

export async function semesterConfigRow(
	db: TenantDb,
): Promise<SemesterConfig | null> {
	const [row] = await db
		.select()
		.from(semesterConfig)
		.where(eq(semesterConfig.id, SEMESTER_CONFIG_ID))
		.limit(1);
	return row ?? null;
}

export async function saveSemesterConfig(
	db: TenantDb,
	input: { name: string; startDate: Date; endDate: Date },
) {
	await db
		.insert(semesterConfig)
		.values({ id: SEMESTER_CONFIG_ID, ...input })
		.onConflictDoUpdate({ target: semesterConfig.id, set: input });
}

// ─── Calendar feed tokens ────────────────────────────────────────────────────

export async function calendarTokenOf(
	db: TenantDb,
	userId: string,
): Promise<string | null> {
	const [row] = await db
		.select({ token: calendarTokens.token })
		.from(calendarTokens)
		.where(eq(calendarTokens.userId, userId))
		.limit(1);
	return row?.token ?? null;
}

export async function insertCalendarToken(
	db: TenantDb,
	userId: string,
	token: string,
) {
	await db.insert(calendarTokens).values({ userId, token });
}

export async function deleteCalendarTokens(db: TenantDb, userId: string) {
	await db.delete(calendarTokens).where(eq(calendarTokens.userId, userId));
}

/** The member a feed token belongs to, or null if it is unknown. */
export async function calendarTokenOwner(db: TenantDb, token: string) {
	const [row] = await db
		.select({
			userId: calendarTokens.userId,
			userName: users.name,
			userEmail: users.email,
		})
		.from(calendarTokens)
		.innerJoin(users, eq(calendarTokens.userId, users.id))
		.where(eq(calendarTokens.token, token))
		.limit(1);
	return row ?? null;
}

export async function touchCalendarToken(
	db: TenantDb,
	token: string,
	at: Date,
) {
	await db
		.update(calendarTokens)
		.set({ lastUsedAt: at })
		.where(eq(calendarTokens.token, token));
}

// ─── What the Semesterprogramm PDF reads ─────────────────────────────────────

/** Members holding one of `roleNames`, one row per role. */
export async function holdersOf(db: TenantDb, roleNames: string[]) {
	return db
		.select({ name: users.name, roleName: roles.name })
		.from(users)
		.innerJoin(userRoles, eq(users.id, userRoles.userId))
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(inArray(roles.name, roleNames));
}

/** The active CC-Kasse account's bank details, or null. */
export async function activeCcKasseAccount(db: TenantDb) {
	const [konto] = await db
		.select({ iban: kontos.iban, bic: kontos.bic, bankName: kontos.bankName })
		.from(kontos)
		.where(and(eq(kontos.kasseType, "CC-Kasse"), eq(kontos.isActive, true)))
		.limit(1);
	return konto ?? null;
}
