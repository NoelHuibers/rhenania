// service.ts — the achievements a member sees on /profile (#33).
//
// Every function takes the TenantScope it reads; a failed query propagates.
// Tracking (the events that move achievements) is in ./tracking.

import "server-only";

import { cache } from "react";
import type { TenantDb } from "~/server/db/tenants";
import type { FoundingDay } from "~/server/domain/achievements/rules";
import { getTenantById } from "~/server/lib/tenant-context";
import { parseFoundingDay } from "~/server/lib/tenant-profile";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

/** The Corps' founding day (Gründungstag, from its branding), if stored. */
export async function foundingDayOf(
	tenant: TenantScope,
): Promise<FoundingDay | null> {
	const config = await getTenantById(tenant.tenantId);
	return parseFoundingDay(config?.branding?.foundingDay);
}

// ── The profile ────────────────────────────────────────────────────────────

const unlockPercentagesOf = cache(
	async (_tenantId: string, db: TenantDb): Promise<Record<string, number>> => {
		const { counts, unlockingUsers } = await repo.unlockCounts(db);
		if (unlockingUsers === 0) {
			return {};
		}
		return Object.fromEntries(
			counts.map((c) => [
				c.achievementId,
				Math.round((c.cnt / unlockingUsers) * 100),
			]),
		);
	},
);

/**
 * Percent of members that unlocked each achievement, keyed by achievement
 * id. Denominator: users with at least one unlock — dormant accounts would
 * otherwise deflate every percentage. Achievements without unlocks are
 * absent from the map (treat as 0). Read once per request and Corps.
 */
export function unlockPercentages(
	tenant: TenantScope,
): Promise<Record<string, number>> {
	return unlockPercentagesOf(tenant.tenantId, tenant.db);
}

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

/** Every achievement the user can see, with their unlocks and progress. */
export async function achievementsOf(
	tenant: TenantScope,
	userId: string,
): Promise<UserAchievementData[]> {
	const { db } = tenant;
	const [allAchievements, userUnlocked, userProgress, percentages, founding] =
		await Promise.all([
			repo.activeAchievements(db),
			repo.unlocksOf(db, userId),
			repo.progressOf(db, userId),
			unlockPercentages(tenant),
			foundingDayOf(tenant),
		]);

	const unlockedMap = new Map(
		userUnlocked.map((u) => [u.achievementId, u.unlockedAt]),
	);
	const progressMap = new Map(
		userProgress.map((p) => [p.achievementId, p.currentValue]),
	);

	// The Gründungstag needs the Corps' founding day; without one it cannot
	// be earned, so it is not listed (unless already unlocked).
	const hasFoundingDay = founding !== null;
	const listed = allAchievements.filter(
		(a) => a.key !== "grundungstag" || hasFoundingDay || unlockedMap.has(a.id),
	);

	return listed.map((a) => ({
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
		unlockPercent: percentages[a.id] ?? 0,
	}));
}
