// ~/server/actions/profile/preferences.ts
"use server";

import { sql } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { userPreferences } from "~/server/db/schema";

type ValueType = "boolean" | "number" | "string" | "json";

function encodeValue(value: unknown, _valueType: ValueType): string {
	// Always JSON-encode so we can safely store anything in TEXT
	return JSON.stringify(value);
}

function decodeValue<T>(raw: string, _valueType: ValueType): T {
	// We JSON.parse first, then assert type based on valueType
	const parsed = JSON.parse(raw);
	return parsed as T;
}

// --- Generic getters/setters ---

export async function getUserPreference<T>(
	key: string,
	fallback: T,
	valueType: ValueType,
): Promise<T> {
	const session = await auth();
	const userId = session?.user?.id;
	if (!userId) return fallback;

	const row = await db.query.userPreferences.findFirst({
		where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.key, key)),
		columns: { value: true, valueType: true },
	});

	if (!row) return fallback;
	try {
		return decodeValue<T>(
			row.value,
			(row as { valueType: ValueType }).valueType ?? valueType,
		);
	} catch {
		return fallback;
	}
}

export async function setUserPreference(
	key: string,
	value: unknown,
	valueType: ValueType,
): Promise<{ success: true } | { success: false; error: string }> {
	const session = await auth();
	const userId = session?.user?.id;
	if (!userId) return { success: false, error: "Not authenticated" };

	const encoded = encodeValue(value, valueType);

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

	return { success: true };
}

// --- Elo-specific sugar ---

const ELO_KEY = "gamification.eloEnabled";

export async function getEloPreferenceAction() {
	// Default: true (participate)
	const enabled = await getUserPreference<boolean>(ELO_KEY, true, "boolean");
	return { enabled };
}

export async function setEloPreferenceAction(opts: { enabled: boolean }) {
	const res = await setUserPreference(ELO_KEY, opts.enabled, "boolean");
	return res;
}

// --- Email notification sugar ---

const EMAIL_NOTIFICATION_KEY = "notifications.emailEnabled";

export async function getEmailNotificationPreferenceAction() {
	// Default: true (receive email notifications)
	const enabled = await getUserPreference<boolean>(
		EMAIL_NOTIFICATION_KEY,
		true,
		"boolean",
	);
	return { enabled };
}

export async function setEmailNotificationPreferenceAction(opts: {
	enabled: boolean;
}) {
	return await setUserPreference(
		EMAIL_NOTIFICATION_KEY,
		opts.enabled,
		"boolean",
	);
}

// --- Semesterprogramm filter (hidden event types) sugar ---

const HIDDEN_EVENT_TYPES_KEY = "semesterprogramm.hiddenTypes";

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

function sanitizeHiddenTypes(value: unknown): EventTypeName[] {
	if (!Array.isArray(value)) return [];
	return value.filter((v): v is EventTypeName =>
		(ALL_EVENT_TYPES as readonly string[]).includes(v),
	);
}

export async function getHiddenEventTypes(): Promise<EventTypeName[]> {
	const raw = await getUserPreference<unknown>(
		HIDDEN_EVENT_TYPES_KEY,
		[],
		"json",
	);
	return sanitizeHiddenTypes(raw);
}

export async function getHiddenEventTypesForUser(
	userId: string,
): Promise<EventTypeName[]> {
	const row = await db.query.userPreferences.findFirst({
		where: (t, { and, eq }) =>
			and(eq(t.userId, userId), eq(t.key, HIDDEN_EVENT_TYPES_KEY)),
		columns: { value: true },
	});
	if (!row) return [];
	try {
		return sanitizeHiddenTypes(JSON.parse(row.value));
	} catch {
		return [];
	}
}

export async function setHiddenEventTypes(types: EventTypeName[]) {
	const sanitized = sanitizeHiddenTypes(types);
	const result = await setUserPreference(
		HIDDEN_EVENT_TYPES_KEY,
		sanitized,
		"json",
	);
	return result;
}

// --- (Optional) Fetch all preferences to render a generic card ---

export async function getAllPreferences() {
	const session = await auth();
	const userId = session?.user?.id;
	if (!userId) return {};

	const rows = await db.query.userPreferences.findMany({
		where: (t, { eq }) => eq(t.userId, userId),
		columns: { key: true, value: true, valueType: true },
	});

	const out: Record<string, unknown> = {};
	for (const r of rows) {
		try {
			out[r.key] = decodeValue(r.value, r.valueType as ValueType);
		} catch {
			out[r.key] = null;
		}
	}
	return out;
}
