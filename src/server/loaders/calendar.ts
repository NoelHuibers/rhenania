// calendar.ts — data for the iCal feeds under /api/calendar.

import "server-only";

import { scopeOf } from "~/server/lib/tenant-scope";
import * as events from "~/server/modules/events/service";
import { hiddenEventTypes } from "~/server/modules/preferences/service";

/** The tenant's public events (date order) and venues, for /api/calendar. */
export async function loadPublicCalendar(tenantId: string) {
	return events.publicCalendar(await scopeOf(tenantId));
}

/**
 * The personal feed behind `token`, or null if the token is unknown in this
 * tenant: every event, venue and RSVP plus the owner's hidden event types.
 * Records the token's last use.
 */
export async function loadMemberCalendar(tenantId: string, token: string) {
	const tenant = await scopeOf(tenantId);
	const owner = await events.calendarOwner(tenant, token);
	if (!owner) {
		return null;
	}
	const [feed, hiddenTypes] = await Promise.all([
		events.memberCalendar(tenant),
		hiddenEventTypes(tenant, owner.userId),
	]);
	return { owner, ...feed, hiddenTypes };
}
