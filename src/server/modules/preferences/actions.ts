"use server";

// actions.ts — the caller's own preferences (#33): the switches on the
// profile page and the Semesterprogramm filter. The setters answer with an
// ActionResult (#216); the getters are read by server components and fall
// back to the default for anonymous callers or a corrupt stored value.

import { z } from "zod";
import { auth } from "~/server/auth";
import { defineAction } from "~/server/lib/define-action";
import { scopeOf } from "~/server/lib/tenant-scope";
import * as preferences from "./service";

export type { EventTypeName, ProfilePreferences } from "./service";

const SAVE_FAILED = "Einstellung konnte nicht gespeichert werden";

// --- Generic getter ---

/** The caller's value for `key`; `fallback` when unset, corrupt or anonymous. */
export async function getUserPreference<T>(
	key: string,
	fallback: T,
	_valueType: preferences.ValueType,
): Promise<T> {
	const session = await auth();
	if (!session) {
		return fallback;
	}
	return preferences.preference(
		await scopeOf(session.tenantId),
		session.user.id,
		key,
		fallback,
	);
}

// The on/off switches take `{ enabled }` and store it as a boolean.
const switchArg = z.object({ enabled: z.boolean() });

// --- Elo-specific sugar ---

export const setEloPreferenceAction = defineAction(
	{ schema: z.tuple([switchArg]), errorMessage: SAVE_FAILED },
	async ([{ enabled }], { tenant, user }) =>
		preferences.savePreference(
			tenant,
			user.id,
			preferences.ELO_PREFERENCE_KEY,
			enabled,
			"boolean",
		),
);

// --- Public profile sugar ---

export const setPublicProfilePreferenceAction = defineAction(
	{ schema: z.tuple([switchArg]), errorMessage: SAVE_FAILED },
	async ([{ enabled }], { tenant, user }) =>
		preferences.savePreference(
			tenant,
			user.id,
			preferences.PUBLIC_PROFILE_KEY,
			enabled,
			"boolean",
		),
);

// --- Challenge notification sugar ---

export async function getChallengeNotificationPreferenceAction() {
	const enabled = await getUserPreference<boolean>(
		preferences.CHALLENGE_NOTIFICATION_KEY,
		true,
		"boolean",
	);
	return { enabled };
}

export const setChallengeNotificationPreferenceAction = defineAction(
	{ schema: z.tuple([switchArg]), errorMessage: SAVE_FAILED },
	async ([{ enabled }], { tenant, user }) =>
		preferences.savePreference(
			tenant,
			user.id,
			preferences.CHALLENGE_NOTIFICATION_KEY,
			enabled,
			"boolean",
		),
);

// --- Email notification sugar ---

export const setEmailNotificationPreferenceAction = defineAction(
	{ schema: z.tuple([switchArg]), errorMessage: SAVE_FAILED },
	async ([{ enabled }], { tenant, user }) =>
		preferences.savePreference(
			tenant,
			user.id,
			preferences.EMAIL_NOTIFICATION_KEY,
			enabled,
			"boolean",
		),
);

// --- Semesterprogramm filter (hidden event types) sugar ---

export async function getHiddenEventTypes(): Promise<
	preferences.EventTypeName[]
> {
	const raw = await getUserPreference<unknown>(
		preferences.HIDDEN_EVENT_TYPES_KEY,
		[],
		"json",
	);
	return preferences.sanitizeHiddenTypes(raw);
}

/** Saves the hidden event types; unknown types are dropped. */
export const setHiddenEventTypes = defineAction(
	{
		schema: z.tuple([z.array(z.string())]),
		errorMessage: "Filter konnte nicht gespeichert werden",
	},
	async ([types], { tenant, user }) =>
		preferences.savePreference(
			tenant,
			user.id,
			preferences.HIDDEN_EVENT_TYPES_KEY,
			preferences.sanitizeHiddenTypes(types),
			"json",
		),
);
