// Fixtures for the Semesterprogramm: events, RSVPs, venues, calendar tokens
// and the semester config, written straight into the current tenant DB.

import {
	calendarTokens,
	eventRsvps,
	events,
	semesterConfig,
	userPreferences,
	venues,
} from "~/server/db/schema";
import { requireTenant, testState } from "../state";

let counter = 0;
const next = () => ++counter;

export async function createEvent(
	opts: Partial<typeof events.$inferInsert> = {},
	tenantId = testState.tenantId,
) {
	const [event] = await requireTenant(tenantId)
		.db.insert(events)
		.values({
			title: `Veranstaltung ${next()}`,
			date: new Date("2026-11-04T19:00:00Z"),
			type: "Intern",
			...opts,
		})
		.returning();
	if (!event) {
		throw new Error("Could not create event");
	}
	return event;
}

export async function createRsvp(
	opts: {
		event: { id: string };
		user: { id: string };
		status: "yes" | "no" | "maybe";
		/** Sets createdAt and updatedAt (the latter defaults to now on insert). */
		at?: Date;
	},
	tenantId = testState.tenantId,
) {
	await requireTenant(tenantId)
		.db.insert(eventRsvps)
		.values({
			eventId: opts.event.id,
			userId: opts.user.id,
			status: opts.status,
			...(opts.at && { createdAt: opts.at, updatedAt: opts.at }),
		});
}

export async function createVenue(
	shortName: string,
	fullAddress: string,
	tenantId = testState.tenantId,
) {
	const [venue] = await requireTenant(tenantId)
		.db.insert(venues)
		.values({ shortName, fullAddress })
		.returning();
	if (!venue) {
		throw new Error("Could not create venue");
	}
	return venue;
}

export async function createCalendarToken(
	user: { id: string },
	token = `token-${next()}`,
	tenantId = testState.tenantId,
) {
	await requireTenant(tenantId)
		.db.insert(calendarTokens)
		.values({ userId: user.id, token });
	return token;
}

export async function hideEventTypes(
	user: { id: string },
	types: string[],
	tenantId = testState.tenantId,
) {
	await requireTenant(tenantId)
		.db.insert(userPreferences)
		.values({
			userId: user.id,
			key: "semesterprogramm.hiddenTypes",
			value: JSON.stringify(types),
			valueType: "json",
		});
}

export async function setSemesterConfig(
	values: { name: string; startDate: Date; endDate: Date },
	tenantId = testState.tenantId,
) {
	await requireTenant(tenantId)
		.db.insert(semesterConfig)
		.values({ id: "singleton", ...values })
		.onConflictDoUpdate({ target: semesterConfig.id, set: values });
}
