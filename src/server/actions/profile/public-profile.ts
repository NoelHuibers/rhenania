"use server";

import { and, eq, gte, isNull, sql } from "drizzle-orm";
import type { UserStats } from "~/components/profile/KPIGrid";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
	achievements,
	drinks,
	orders,
	roles,
	userAchievements,
	userRoles,
	users,
} from "~/server/db/schema";
import { getAchievementUnlockPercentages } from "~/server/lib/achievement-stats";
import {
	type EloHistoryPoint,
	getEloStatsForUser,
} from "~/server/lib/elo-stats";
import {
	isEloEnabledForUser,
	isPublicProfileEnabledForUser,
} from "./preferences";

export type PublicAchievement = {
	id: string;
	name: string;
	description: string;
	category: "drinking" | "games" | "social" | "financial" | "time" | "special";
	icon: string | null;
	points: number;
	rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
	unlockedAt: Date | null;
	unlockPercent: number;
};

export type PublicProfileUser = {
	id: string;
	name: string | null;
	image: string | null;
};

export type PublicProfileResult =
	| { status: "not_found" }
	| { status: "private"; user: PublicProfileUser }
	| {
			status: "public";
			user: PublicProfileUser & { roles: string[] };
			achievements: PublicAchievement[];
			totalPoints: number;
			elo: { stats: UserStats; eloHistory: EloHistoryPoint[] } | null;
			drinkStats: { litersLast6Months: number };
	  };

// Public view of another member's profile. Deliberately never selects
// email, member record, billing, or payment data — only gamified stats.
export async function getPublicProfile(
	userId: string,
): Promise<PublicProfileResult> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("Nicht angemeldet");

	// The tenant DB is per-tenant, so a `user` row proves same-tenant membership.
	const [targetUser] = await db
		.select({ id: users.id, name: users.name, image: users.image })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!targetUser) return { status: "not_found" };

	if (!(await isPublicProfileEnabledForUser(userId))) {
		return { status: "private", user: targetUser };
	}

	const sixMonthsAgo = sql<number>`unixepoch('now','-6 months')`;

	const [roleRows, unlockedRows, unlockPercentages, eloEnabled, litersRow] =
		await Promise.all([
			db
				.select({ roleName: roles.name })
				.from(userRoles)
				.innerJoin(roles, eq(userRoles.roleId, roles.id))
				.where(eq(userRoles.userId, userId)),
			db
				.select({
					id: achievements.id,
					name: achievements.name,
					description: achievements.description,
					category: achievements.category,
					icon: achievements.icon,
					points: achievements.points,
					rarity: achievements.rarity,
					unlockedAt: userAchievements.unlockedAt,
				})
				.from(userAchievements)
				.innerJoin(
					achievements,
					eq(userAchievements.achievementId, achievements.id),
				)
				.where(
					and(
						eq(userAchievements.userId, userId),
						eq(achievements.isActive, true),
					),
				),
			getAchievementUnlockPercentages(),
			isEloEnabledForUser(userId),
			db
				.select({
					liters: sql<number>`SUM(CASE WHEN ${drinks.volume} IS NOT NULL THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`,
				})
				.from(orders)
				.leftJoin(drinks, eq(orders.drinkId, drinks.id))
				.where(
					and(
						eq(orders.userId, userId),
						gte(orders.createdAt, sixMonthsAgo),
						isNull(orders.bookingFor),
					),
				),
		]);

	const publicAchievements: PublicAchievement[] = unlockedRows.map((a) => ({
		...a,
		unlockPercent: unlockPercentages[a.id] ?? 0,
	}));

	const elo = eloEnabled ? await getEloStatsForUser(userId) : null;

	return {
		status: "public",
		user: { ...targetUser, roles: roleRows.map((r) => r.roleName) },
		achievements: publicAchievements,
		totalPoints: publicAchievements.reduce((sum, a) => sum + a.points, 0),
		elo,
		drinkStats: {
			litersLast6Months:
				Math.round(Number(litersRow[0]?.liters ?? 0) * 100) / 100,
		},
	};
}
