// elo-preference.ts — the per-Corps "take part in the ELO ranking" opt-out.
//
// The preference lives in each Corps' own `userPreferences` table, so code
// that looks at a player of another Corps (cross-Corps challenges) must read
// it from THAT Corps' database.

import type { TenantDb } from "~/server/db/tenants";

export const ELO_PREFERENCE_KEY = "gamification.eloEnabled";

/** The stored value of an opt-out (`setPreference` writes JSON). */
export const ELO_OPT_OUT = JSON.stringify(false);

/**
 * The one definition of "opted out" (#244): only the stored `false`. No
 * row, or any other value, means the player takes part. SQL filters
 * compare against ELO_OPT_OUT, so this must stay a plain comparison.
 */
export function isEloOptOut(value: string | null | undefined): boolean {
	return value === ELO_OPT_OUT;
}

/** Whether the user takes part in the ranking (default: yes). */
export async function readEloEnabled(
	db: TenantDb,
	userId: string,
): Promise<boolean> {
	const row = await db.query.userPreferences.findFirst({
		where: (t, { and, eq }) =>
			and(eq(t.userId, userId), eq(t.key, ELO_PREFERENCE_KEY)),
		columns: { value: true },
	});
	return !isEloOptOut(row?.value);
}
