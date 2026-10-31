// ~/server/actions/profile/preferences.ts
"use server";

// The caller's own preferences (switches on the profile page, the
// Semesterprogramm filter). The setters answer with an ActionResult (#216);
// the getters are read by server components and fall back to the default
// for anonymous callers or a corrupt stored value.

import { sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "~/server/auth";
import { userPreferences } from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";
import { defineAction } from "~/server/lib/define-action";
import { ELO_PREFERENCE_KEY } from "~/server/lib/elo-preference";
import {
	type EventTypeName,
	HIDDEN_EVENT_TYPES_KEY,
	PUBLIC_PROFILE_KEY,
	sanitizeHiddenTypes,
} from "~/server/lib/preferences";
import { scopeOf } from "~/server/lib/tenant-scope";

type ValueType = "boolean" | "number" | "string" | "json";

const SAVE_FAILED = "Einstellung konnte nicht gespeichert werden";

/** Stores `value` JSON-encoded, so anything fits the TEXT column. */
async function savePreference(
	db: TenantDb,
	userId: string,
	key: string,
	value: unknown,
	valueType: ValueType,
): Promise<void> {
	const encoded = JSON.stringify(value);
	await db
		.insert(userPreferences)
		.values({
			userId,
			key,
			value: encoded,
			valueType,
			updatedAt: sql`(unixepoch())`,
		})
		.onConflictDoUpdate({
			target: [userPreferences.userId, userPreferences.key],
			set: {
				value: encoded,
				valueType,
				updatedAt: sql`(unixepoch())`,
			},
		});
}

// --- Generic getter ---

/** The caller's value for `key`; `fallback` when unset, corrupt or anonymous. */
export async function getUserPreference<T>(
	key: string,
	fallback: T,
	_valueType: ValueType,
): Promise<T> {
	const session = await auth();
	if (!session) {
		return fallback;
	}
	const { db } = await scopeOf(session.tenantId);
	const row = await db.query.userPreferences.findFirst({
		where: (t, { and, eq }) =>
			and(eq(t.userId, session.user.id), eq(t.key, key)),
		columns: { value: true },
	});
	if (!row) {
		return fallback;
	}
	try {
		return JSON.parse(row.value) as T;
	} catch {
		return fallback;
	}
}

// The on/off switches take `{ enabled }` and store it as a boolean.
const switchArg = z.object({ enabled: z.boolean() });

// --- Elo-specific sugar ---

export const setEloPreferenceAction = defineAction(
	{ schema: z.tuple([switchArg]), errorMessage: SAVE_FAILED },
	async ([{ enabled }], { tenant, user }) =>
		savePreference(tenant.db, user.id, ELO_PREFERENCE_KEY, enabled, "boolean"),
);

// --- Public profile sugar ---

export const setPublicProfilePreferenceAction = defineAction(
	{ schema: z.tuple([switchArg]), errorMessage: SAVE_FAILED },
	async ([{ enabled }], { tenant, user }) =>
		savePreference(tenant.db, user.id, PUBLIC_PROFILE_KEY, enabled, "boolean"),
);

// --- Challenge notification sugar ---

const CHALLENGE_NOTIF_KEY = "gamification.challengeNotificationsEnabled";

export async function getChallengeNotificationPreferenceAction() {
	const enabled = await getUserPreference<boolean>(
		CHALLENGE_NOTIF_KEY,
		true,
		"boolean",
	);
	return { enabled };
}

export const setChallengeNotificationPreferenceAction = defineAction(
	{ schema: z.tuple([switchArg]), errorMessage: SAVE_FAILED },
	async ([{ enabled }], { tenant, user }) =>
		savePreference(tenant.db, user.id, CHALLENGE_NOTIF_KEY, enabled, "boolean"),
);

// --- Email notification sugar ---

const EMAIL_NOTIFICATION_KEY = "notifications.emailEnabled";

export const setEmailNotificationPreferenceAction = defineAction(
	{ schema: z.tuple([switchArg]), errorMessage: SAVE_FAILED },
	async ([{ enabled }], { tenant, user }) =>
		savePreference(
			tenant.db,
			user.id,
			EMAIL_NOTIFICATION_KEY,
			enabled,
			"boolean",
		),
);

// --- Semesterprogramm filter (hidden event types) sugar ---

export type { EventTypeName };

export async function getHiddenEventTypes(): Promise<EventTypeName[]> {
	const raw = await getUserPreference<unknown>(
		HIDDEN_EVENT_TYPES_KEY,
		[],
		"json",
	);
	return sanitizeHiddenTypes(raw);
}

/** Saves the hidden event types; unknown types are dropped. */
export const setHiddenEventTypes = defineAction(
	{
		schema: z.tuple([z.array(z.string())]),
		errorMessage: "Filter konnte nicht gespeichert werden",
	},
	async ([types], { tenant, user }) =>
		savePreference(
			tenant.db,
			user.id,
			HIDDEN_EVENT_TYPES_KEY,
			sanitizeHiddenTypes(types),
			"json",
		),
);
