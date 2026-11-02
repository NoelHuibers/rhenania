"use server";

// actions.ts — every Semesterprogramm action (#33): events, RSVPs,
// recurring templates, venues, the semester config and the calendar feed
// token. Check the caller and the input, then one call to the events
// service. The changes answer with an ActionResult; the reads keep their
// old answers: the event lists log a failed query and answer it with [],
// the public ones need no session, a signed-out caller gets no RSVPs and
// no feed token.

import { z } from "zod";
import { auth } from "~/server/auth";
import { ROLES, requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { currentTenantScope, scopeOf } from "~/server/lib/tenant-scope";
import * as events from "./service";

export type { RecurrenceType } from "~/server/domain/events/recurrence";
export type {
	AttendeePreview,
	RsvpCounts,
	RsvpStatus,
	SemesterConfig,
	Venue,
} from "./service";

// Per-tenant configurable; valid values come from the tenant's
// `event_type` table. Kept as `string` for type-level openness.
export type EventType = string;

/** Pages that show events; revalidated after every change to one. */
const EVENT_PAGES = ["/", "/semesterprogramm", "/admin/semesterprogramm"];
const RSVP_PAGES = ["/semesterprogramm", "/admin/semesterprogramm"];
const ADMIN_PAGE = ["/admin/semesterprogramm"];

// ─── Events ──────────────────────────────────────────────────────────────────

export async function getUpcomingEvents(limit?: number) {
	const { tenantId } = await requireCaller();
	try {
		return await events.upcomingEvents(await scopeOf(tenantId), limit);
	} catch (error) {
		console.error("Error fetching upcoming events:", error);
		return [];
	}
}

/** The website's next public events; anyone may read them. */
export async function getPublicUpcomingEvents(limit?: number) {
	try {
		return await events.publicUpcomingEvents(await currentTenantScope(), limit);
	} catch (error) {
		console.error("Error fetching public upcoming events:", error);
		return [];
	}
}

/** The website's past public events; anyone may read them. */
export async function getPublicPastEvents(limit?: number) {
	try {
		return await events.publicPastEvents(await currentTenantScope(), limit);
	} catch (error) {
		console.error("Error fetching public past events:", error);
		return [];
	}
}

export async function getAllEvents() {
	const { tenantId } = await requireCaller();
	try {
		return await events.allEventsWithCounts(await scopeOf(tenantId));
	} catch (error) {
		console.error("Error fetching all events:", error);
		return [];
	}
}

export const createEvent = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([events.eventInputSchema]),
		revalidate: EVENT_PAGES,
		errorMessage: "Veranstaltung konnte nicht erstellt werden",
	},
	async ([input], { tenant }) => events.createEvent(tenant, input),
);

export const updateEvent = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string(), events.eventInputSchema.partial()]),
		revalidate: EVENT_PAGES,
		errorMessage: "Veranstaltung konnte nicht aktualisiert werden",
	},
	async ([eventId, input], { tenant }) =>
		events.updateEvent(tenant, eventId, input),
);

export const deleteEvent = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string()]),
		revalidate: EVENT_PAGES,
		errorMessage: "Veranstaltung konnte nicht gelöscht werden",
	},
	async ([eventId], { tenant }) => events.deleteEvent(tenant, eventId),
);

export const toggleEventCancelled = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string()]),
		revalidate: EVENT_PAGES,
		errorMessage: "Fehler aufgetreten",
	},
	async ([eventId], { tenant }) => events.toggleEventCancelled(tenant, eventId),
);

// ─── RSVPs ───────────────────────────────────────────────────────────────────

export const setRsvp = defineAction(
	{
		schema: z.tuple([
			z.string(),
			events.rsvpStatusSchema,
			z.string().optional(),
		]),
		revalidate: RSVP_PAGES,
		errorMessage: "Antwort konnte nicht gespeichert werden.",
	},
	async ([eventId, status, note], { tenant, user }) =>
		events.setRsvp(tenant, user, eventId, status, note),
);

export const removeRsvp = defineAction(
	{
		schema: z.tuple([z.string()]),
		revalidate: RSVP_PAGES,
		errorMessage: "Antwort konnte nicht gespeichert werden.",
	},
	async ([eventId], { tenant, user }) =>
		events.removeRsvp(tenant, user, eventId),
);

/** The caller's answers; empty for a signed-out caller. */
export async function getUserRsvpsForEvents(eventIds: string[]) {
	if (eventIds.length === 0) {
		return new Map<string, events.RsvpStatus>();
	}
	const session = await auth();
	if (!session?.user?.id) {
		return new Map<string, events.RsvpStatus>();
	}
	return events.answersOf(
		await scopeOf(session.tenantId),
		session.user.id,
		eventIds,
	);
}

export async function getRsvpCountsForEvents(eventIds: string[]) {
	const { tenantId } = await requireCaller();
	if (eventIds.length === 0) {
		return new Map<string, events.RsvpCounts>();
	}
	return events.answerCounts(await scopeOf(tenantId), eventIds);
}

/** Every answer with the members' e-mail addresses, for Admins. */
export async function getEventRsvps(eventId: string) {
	const { tenantId } = await requireCaller(ROLES.events);
	return events.answersWithContacts(await scopeOf(tenantId), eventId);
}

export async function getYesAttendeePreviewForEvents(eventIds: string[]) {
	const { tenantId } = await requireCaller();
	if (eventIds.length === 0) {
		return new Map<string, events.AttendeePreview[]>();
	}
	return events.yesPreview(await scopeOf(tenantId), eventIds);
}

export async function getEventAttendees(eventId: string) {
	const { tenantId } = await requireCaller();
	return events.attendees(await scopeOf(tenantId), eventId);
}

// ─── Recurring event templates ───────────────────────────────────────────────

export async function getAllRecurringEvents() {
	const { tenantId } = await requireCaller(ROLES.events);
	try {
		return await events.listRecurringEvents(await scopeOf(tenantId));
	} catch (error) {
		console.error("Error fetching recurring events:", error);
		return [];
	}
}

export const createRecurringEvent = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([events.recurringEventInputSchema]),
		revalidate: ADMIN_PAGE,
		errorMessage: "Konnte nicht erstellt werden",
	},
	async ([input], { tenant }) => events.createRecurringEvent(tenant, input),
);

export const updateRecurringEvent = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string(), events.recurringEventInputSchema.partial()]),
		revalidate: ADMIN_PAGE,
		errorMessage: "Konnte nicht aktualisiert werden",
	},
	async ([recurringEventId, input], { tenant }) =>
		events.updateRecurringEvent(tenant, recurringEventId, input),
);

export const toggleRecurringEventActive = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string()]),
		revalidate: ADMIN_PAGE,
		errorMessage: "Fehler aufgetreten",
	},
	async ([recurringEventId], { tenant }) =>
		events.toggleRecurringEventActive(tenant, recurringEventId),
);

export const deleteRecurringEvent = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string()]),
		revalidate: ADMIN_PAGE,
		errorMessage: "Konnte nicht gelöscht werden",
	},
	async ([recurringEventId], { tenant }) =>
		events.deleteRecurringEvent(tenant, recurringEventId),
);

/** Adds the template's missing occurrences; answers how many it created. */
export const generateInstances = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string()]),
		revalidate: EVENT_PAGES,
		errorMessage: "Fehler beim Generieren",
	},
	async ([recurringEventId], { tenant }) =>
		events.generateInstances(tenant, recurringEventId),
);

// ─── Venues ──────────────────────────────────────────────────────────────────

export async function getVenues(): Promise<events.Venue[]> {
	const { tenantId } = await requireCaller();
	return events.listVenues(await scopeOf(tenantId));
}

export const createVenue = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string(), z.string()]),
		revalidate: ADMIN_PAGE,
		errorMessage: "Fehler beim Speichern",
	},
	async ([shortName, fullAddress], { tenant }) =>
		events.createVenue(tenant, shortName, fullAddress),
);

export const updateVenue = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string(), z.string(), z.string()]),
		revalidate: ADMIN_PAGE,
		errorMessage: "Fehler beim Speichern",
	},
	async ([venueId, shortName, fullAddress], { tenant }) =>
		events.updateVenue(tenant, venueId, shortName, fullAddress),
);

export const deleteVenue = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([z.string()]),
		revalidate: ADMIN_PAGE,
		errorMessage: "Fehler beim Löschen",
	},
	async ([venueId], { tenant }) => events.deleteVenue(tenant, venueId),
);

// ─── The semester config ─────────────────────────────────────────────────────

export async function getSemesterConfig(): Promise<events.SemesterConfig | null> {
	const { tenantId } = await requireCaller();
	return events.semesterConfig(await scopeOf(tenantId));
}

export const upsertSemesterConfig = defineAction(
	{
		roles: ROLES.events,
		schema: z.tuple([events.semesterConfigSchema]),
		revalidate: ADMIN_PAGE,
		errorMessage: "Fehler beim Speichern",
	},
	async ([input], { tenant }) => events.saveSemesterConfig(tenant, input),
);

// ─── The personal calendar feed ──────────────────────────────────────────────

/** The caller's feed token, created on first use; null when signed out. */
export async function getOrCreateCalendarToken() {
	const session = await auth();
	if (!session?.user?.id) {
		return null;
	}
	return events.calendarTokenFor(
		await scopeOf(session.tenantId),
		session.user.id,
	);
}

/**
 * Replaces the caller's feed token; old subscription links stop working.
 * No UI calls it yet, but it is the only way to revoke a leaked feed URL;
 * keep it until the profile page offers it.
 *
 * @public
 */
export const rotateCalendarToken = defineAction(
	{ errorMessage: "Der Kalender-Link konnte nicht erneuert werden" },
	async ({ tenant, user }) => events.rotateCalendarToken(tenant, user.id),
);
