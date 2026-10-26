// elo-preference.ts — the per-Corps "take part in the ELO ranking" opt-out.
//
// The preference lives in each Corps' own `userPreferences` table, so code
// that looks at a player of another Corps (cross-Corps challenges) must read
// it from THAT Corps' database.

import type { TenantDb } from "~/server/db/tenants";

export const ELO_PREFERENCE_KEY = "gamification.eloEnabled";

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
	if (!row) {
		return true;
	}
	try {
		return JSON.parse(row.value) !== false;
	} catch {
		return true;
	}
}
