// repo.ts — a member's preferences in the tenant DB (#33).
//
// Drizzle reads and writes of `user_preference`: one stored value per user
// and key, JSON-encoded. Every function takes the database it runs on; none
// checks the caller or applies a rule. A missing value is null; a failed
// query throws.

import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { userPreferences } from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";

export type ValueType = "boolean" | "number" | "string" | "json";

/** The stored (JSON-encoded) value of `key`, or null if unset. */
export async function storedValue(
	db: TenantDb,
	userId: string,
	key: string,
): Promise<string | null> {
	const row = await db.query.userPreferences.findFirst({
		where: (t, { and, eq }) => and(eq(t.userId, userId), eq(t.key, key)),
		columns: { value: true },
	});
	return row?.value ?? null;
}

/** The stored values of the given keys that are set, in one query. */
export async function storedValues(
	db: TenantDb,
	userId: string,
	keys: string[],
) {
	return db
		.select({ key: userPreferences.key, value: userPreferences.value })
		.from(userPreferences)
		.where(
			and(
				eq(userPreferences.userId, userId),
				inArray(userPreferences.key, keys),
			),
		);
}

/** Stores the encoded value, replacing an earlier one. */
export async function saveValue(
	db: TenantDb,
	userId: string,
	key: string,
	encoded: string,
	valueType: ValueType,
): Promise<void> {
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
