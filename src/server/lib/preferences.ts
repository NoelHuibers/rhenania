// preferences.ts — read another user's preferences on the server.
//
// Plain server helpers (not server actions): used by other actions, server
// components and the token-based calendar feed, which has no session. The
// browser reads its own preferences through the actions in
// src/server/actions/profile/preferences.ts.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "~/server/db";
import { userPreferences } from "~/server/db/schema";
import {
	ELO_PREFERENCE_KEY,
	readEloEnabled,
} from "~/server/lib/elo-preference";

const PUBLIC_PROFILE_KEY = "privacy.publicProfileEnabled";
const HIDDEN_EVENT_TYPES_KEY = "semesterprogramm.hiddenTypes";

export const ALL_EVENT_TYPES = [
	"Intern",
	"AHV",
	"oCC",
	"SC",
	"Jour Fix",
	"Stammtisch",
	"Sonstige",
] as const;

export type EventTypeName = (typeof ALL_EVENT_TYPES)[number];

export function sanitizeHiddenTypes(value: unknown): EventTypeName[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((v): v is EventTypeName =>
		(ALL_EVENT_TYPES as readonly string[]).includes(v),
	);
}

async function readRaw(userId: string, key: string): Promise<string | null> {
	const row = await db.query.userPreferences.findFirst({
		where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.key, key)),
		columns: { value: true },
	});
	return row?.value ?? null;
}

async function readFlag(userId: string, key: string): Promise<boolean> {
	const raw = await readRaw(userId, key);
	if (raw === null) {
		return true;
	}
	try {
		return JSON.parse(raw) !== false;
	} catch {
		return true;
	}
}

/** Whether the user takes part in ELO (default: yes). */
export function isEloEnabledForUser(userId: string): Promise<boolean> {
	return readEloEnabled(db, userId);
}

/** Whether other members may see the user's public profile (default: yes). */
export function isPublicProfileEnabledForUser(
	userId: string,
): Promise<boolean> {
	return readFlag(userId, PUBLIC_PROFILE_KEY);
}

/** The on/off switches of the profile page. */
export type ProfilePreferences = {
	elo: boolean;
	challengeNotifications: boolean;
	email: boolean;
	publicProfile: boolean;
};

const PROFILE_FLAG_KEYS = {
	elo: ELO_PREFERENCE_KEY,
	challengeNotifications: "gamification.challengeNotificationsEnabled",
	email: "notifications.emailEnabled",
	publicProfile: PUBLIC_PROFILE_KEY,
} as const satisfies Record<keyof ProfilePreferences, string>;

function parseFlag(raw: string | undefined): boolean {
	if (raw === undefined) {
		return true;
	}
	try {
		return JSON.parse(raw) !== false;
	} catch {
		return true;
	}
}

/** The profile page's switches in one query; each defaults to on (#24). */
export async function getProfilePreferencesForUser(
	userId: string,
): Promise<ProfilePreferences> {
	const rows = await db
		.select({ key: userPreferences.key, value: userPreferences.value })
		.from(userPreferences)
		.where(
			and(
				eq(userPreferences.userId, userId),
				inArray(userPreferences.key, Object.values(PROFILE_FLAG_KEYS)),
			),
		);
	const raw = new Map(rows.map((r) => [r.key, r.value]));
	return {
		elo: parseFlag(raw.get(PROFILE_FLAG_KEYS.elo)),
		challengeNotifications: parseFlag(
			raw.get(PROFILE_FLAG_KEYS.challengeNotifications),
		),
		email: parseFlag(raw.get(PROFILE_FLAG_KEYS.email)),
		publicProfile: parseFlag(raw.get(PROFILE_FLAG_KEYS.publicProfile)),
	};
}

/** Event types the user hid from their Semesterprogramm and calendar feed. */
export async function getHiddenEventTypesForUser(
	userId: string,
): Promise<EventTypeName[]> {
	const raw = await readRaw(userId, HIDDEN_EVENT_TYPES_KEY);
	if (raw === null) {
		return [];
	}
	try {
		return sanitizeHiddenTypes(JSON.parse(raw));
	} catch {
		return [];
	}
}
