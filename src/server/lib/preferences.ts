// preferences.ts — read another user's preferences on the server.
//
// Plain server helpers (not server actions): used by other actions, server
// components and the token-based calendar feed, which has no session. The
// browser reads its own preferences through the actions in
// src/server/actions/profile/preferences.ts.

import { db } from "~/server/db";
import { readEloEnabled } from "~/server/lib/elo-preference";

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
