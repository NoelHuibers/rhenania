// calendar.ts — data for the iCal feeds under /api/calendar.

import "server-only";

import { asc, eq } from "drizzle-orm";

import {
	calendarTokens,
	eventRsvps,
	events,
	users,
	venues,
} from "~/server/db/schema";
import { getTenantDb } from "~/server/db/tenants";
import { getHiddenEventTypesForUser } from "~/server/lib/preferences";

/** The tenant's public events (date order) and venues, for /api/calendar. */
export async function loadPublicCalendar(tenantId: string) {
	const db = await getTenantDb(tenantId);
	const [rows, venueRows] = await Promise.all([
		// Public feed: public events only. Members get everything through
		// their personal token feed (/api/calendar/[token]).
		db
			.select()
			.from(events)
			.where(eq(events.isPublic, true))
			.orderBy(asc(events.date)),
		db.select().from(venues),
	]);
	return { events: rows, venues: venueRows };
}

/**
 * The personal feed behind `token`, or null if the token is unknown in this
 * tenant: every event, venue and RSVP plus the owner's hidden event types.
 * Records the token's last use.
 */
export async function loadMemberCalendar(tenantId: string, token: string) {
	const db = await getTenantDb(tenantId);

	const [tokenRow] = await db
		.select({
			userId: calendarTokens.userId,
			userName: users.name,
			userEmail: users.email,
		})
		.from(calendarTokens)
		.innerJoin(users, eq(calendarTokens.userId, users.id))
		.where(eq(calendarTokens.token, token))
		.limit(1);

	if (!tokenRow) {
		return null;
	}

	await db
		.update(calendarTokens)
		.set({ lastUsedAt: new Date() })
		.where(eq(calendarTokens.token, token));

	const [rows, venueRows, rsvps, hiddenTypes] = await Promise.all([
		db.select().from(events).orderBy(asc(events.date)),
		db.select().from(venues),
		db
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
			.innerJoin(users, eq(eventRsvps.userId, users.id)),
		getHiddenEventTypesForUser(tokenRow.userId),
	]);

	return {
		owner: tokenRow,
		events: rows,
		venues: venueRows,
		rsvps,
		hiddenTypes,
	};
}
