import { sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "~/server/db";
import { userAchievements } from "~/server/db/schema";

// Percent of members that unlocked each achievement, keyed by achievement id.
// Denominator: users with at least one unlock — dormant accounts would
// otherwise deflate every percentage. Achievements without unlocks are absent
// from the map (treat as 0).
export const getAchievementUnlockPercentages = cache(
	async (): Promise<Record<string, number>> => {
		const [counts, totals] = await Promise.all([
			db
				.select({
					achievementId: userAchievements.achievementId,
					cnt: sql<number>`count(*)`,
				})
				.from(userAchievements)
				.groupBy(userAchievements.achievementId),
			db
				.select({
					total: sql<number>`count(distinct ${userAchievements.userId})`,
				})
				.from(userAchievements),
		]);

		const total = totals[0]?.total ?? 0;
		if (total === 0) return {};

		return Object.fromEntries(
			counts.map((c) => [c.achievementId, Math.round((c.cnt / total) * 100)]),
		);
	},
);
