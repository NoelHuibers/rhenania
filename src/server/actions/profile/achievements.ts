"use server";

import { eq } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
	achievementProgress,
	achievements,
	userAchievements,
} from "~/server/db/schema";
import { getAchievementUnlockPercentages } from "~/server/lib/achievement-stats";

export type UserAchievementData = {
	id: string;
	key: string;
	name: string;
	description: string;
	category: "drinking" | "games" | "social" | "financial" | "time" | "special";
	icon: string | null;
	targetValue: number | null;
	points: number;
	rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
	isSecret: boolean;
	unlocked: boolean;
	unlockedAt: Date | null;
	currentValue: number;
	unlockPercent: number;
};

export async function getUserAchievements(): Promise<UserAchievementData[]> {
	const session = await auth();
	if (!session?.user?.id) throw new Error("Nicht angemeldet");

	const userId = session.user.id;

	const [allAchievements, userUnlocked, userProgress, unlockPercentages] =
		await Promise.all([
			db.select().from(achievements).where(eq(achievements.isActive, true)),
			db
				.select()
				.from(userAchievements)
				.where(eq(userAchievements.userId, userId)),
			db
				.select()
				.from(achievementProgress)
				.where(eq(achievementProgress.userId, userId)),
			getAchievementUnlockPercentages(),
		]);

	const unlockedMap = new Map(
		userUnlocked.map((u) => [u.achievementId, u.unlockedAt]),
	);
	const progressMap = new Map(
		userProgress.map((p) => [p.achievementId, p.currentValue]),
	);

	return allAchievements.map((a) => ({
		id: a.id,
		key: a.key,
		name: a.name,
		description: a.description,
		category: a.category,
		icon: a.icon,
		targetValue: a.targetValue,
		points: a.points,
		rarity: a.rarity,
		isSecret: a.isSecret,
		unlocked: unlockedMap.has(a.id),
		unlockedAt: unlockedMap.get(a.id) ?? null,
		currentValue: progressMap.get(a.id) ?? 0,
		unlockPercent: unlockPercentages[a.id] ?? 0,
	}));
}
