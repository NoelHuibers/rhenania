// ~/server/actions/profile/preferences.ts
"use server";

import { sql } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { userPreferences } from "~/server/db/schema";

type ValueType = "boolean" | "number" | "string" | "json";

function encodeValue(value: unknown, valueType: ValueType): string {
  // Always JSON-encode so we can safely store anything in TEXT
  return JSON.stringify(value);
}

function decodeValue<T>(raw: string, valueType: ValueType): T {
  // We JSON.parse first, then assert type based on valueType
  const parsed = JSON.parse(raw);
  return parsed as T;
}

// --- Generic getters/setters ---

export async function getUserPreference<T>(
  key: string,
  fallback: T,
  valueType: ValueType
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
    return decodeValue<T>(row.value, (row as any).valueType ?? valueType);
  } catch {
    return fallback;
  }
}

export async function setUserPreference(
  key: string,
  value: unknown,
  valueType: ValueType
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
