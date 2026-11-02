// service.ts — a member's preferences (#33): the switches of the profile
// page, the public profile, the ELO opt-out and the Semesterprogramm filter.
//
// Every function takes the TenantScope (the preferences are per Corps) and
// the member. Values are stored JSON-encoded; an unset or corrupt value
// reads as the default. The ELO opt-out is read by lib/elo-preference.ts,
// shared with the games.

import "server-only";

import {
	ELO_PREFERENCE_KEY,
	readEloEnabled,
} from "~/server/lib/elo-preference";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

export type { ValueType } from "./repo";

export { ELO_PREFERENCE_KEY };
export const PUBLIC_PROFILE_KEY = "privacy.publicProfileEnabled";
export const HIDDEN_EVENT_TYPES_KEY = "semesterprogramm.hiddenTypes";
export const CHALLENGE_NOTIFICATION_KEY =
	"gamification.challengeNotificationsEnabled";
export const EMAIL_NOTIFICATION_KEY = "notifications.emailEnabled";

const ALL_EVENT_TYPES = [
	"Intern",
	"AHV",
	"oCC",
	"SC",
	"Jour Fix",
	"Stammtisch",
	"Sonstige",
] as const;

export type EventTypeName = (typeof ALL_EVENT_TYPES)[number];

/** The known event types in `value`; anything else is dropped. */
export function sanitizeHiddenTypes(value: unknown): EventTypeName[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.filter((v): v is EventTypeName =>
		(ALL_EVENT_TYPES as readonly string[]).includes(v),
	);
}

/** An on/off switch: on unless it is stored as `false`. */
function parseFlag(raw: string | null | undefined): boolean {
	if (raw == null) {
		return true;
	}
	try {
		return JSON.parse(raw) !== false;
	} catch {
		return true;
	}
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** The member's value for `key`; `fallback` when unset or corrupt. */
export async function preference<T>(
	{ db }: TenantScope,
	userId: string,
	key: string,
	fallback: T,
): Promise<T> {
	const raw = await repo.storedValue(db, userId, key);
	if (raw === null) {
		return fallback;
	}
	try {
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

/** Whether the member takes part in ELO (default: yes). */
export function isEloEnabled({ db }: TenantScope, userId: string) {
	return readEloEnabled(db, userId);
}

/** Whether other members may see the member's public profile (default: yes). */
export async function isPublicProfileEnabled(
	{ db }: TenantScope,
	userId: string,
): Promise<boolean> {
	return parseFlag(await repo.storedValue(db, userId, PUBLIC_PROFILE_KEY));
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
	challengeNotifications: CHALLENGE_NOTIFICATION_KEY,
	email: EMAIL_NOTIFICATION_KEY,
	publicProfile: PUBLIC_PROFILE_KEY,
} as const satisfies Record<keyof ProfilePreferences, string>;

/** The profile page's switches in one query; each defaults to on (#24). */
export async function profilePreferences(
	{ db }: TenantScope,
	userId: string,
): Promise<ProfilePreferences> {
	const rows = await repo.storedValues(
		db,
		userId,
		Object.values(PROFILE_FLAG_KEYS),
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

/** Event types the member hid from their Semesterprogramm and calendar feed. */
export async function hiddenEventTypes(
	{ db }: TenantScope,
	userId: string,
): Promise<EventTypeName[]> {
	const raw = await repo.storedValue(db, userId, HIDDEN_EVENT_TYPES_KEY);
	if (raw === null) {
		return [];
	}
	try {
		return sanitizeHiddenTypes(JSON.parse(raw));
	} catch {
		return [];
	}
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/** Stores `value` JSON-encoded, so anything fits the TEXT column. */
export async function savePreference(
	{ db }: TenantScope,
	userId: string,
	key: string,
	value: unknown,
	valueType: repo.ValueType,
): Promise<void> {
	await repo.saveValue(db, userId, key, JSON.stringify(value), valueType);
}
