// user-stats.ts — read/update each user's unified ELO + W/L stats.
//
// `userStats` lives in the control DB, so a user with memberships in multiple
// Corps has a single ELO across all of them. Both intra-Corps and cross-Corps
// games go through `applyEloOutcome`.

import { eq, inArray } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import { userStats } from "~/server/db/control-schema";
import { calculateEloChange, DEFAULT_ELO } from "~/server/lib/elo";

export type UserStats = {
	userId: string;
	currentElo: number;
	totalGames: number;
	wins: number;
	losses: number;
	peakElo: number;
};

export async function getOrCreateUserStats(userId: string): Promise<UserStats> {
	const [row] = await controlDb
		.select()
		.from(userStats)
		.where(eq(userStats.userId, userId))
		.limit(1);
	if (row) {
		return {
			userId: row.userId,
			currentElo: row.currentElo,
			totalGames: row.totalGames,
			wins: row.wins,
			losses: row.losses,
			peakElo: row.peakElo,
		};
	}

	const seed = {
		userId,
		currentElo: DEFAULT_ELO,
		totalGames: 0,
		wins: 0,
		losses: 0,
		peakElo: DEFAULT_ELO,
	};
	await controlDb
		.insert(userStats)
		.values(seed)
		.onConflictDoNothing({ target: userStats.userId });
	return seed;
}

export async function getOrCreateUserStatsBatch(
	userIds: string[],
): Promise<Map<string, UserStats>> {
	const out = new Map<string, UserStats>();
	if (userIds.length === 0) return out;

	const existing = await controlDb
		.select()
		.from(userStats)
		.where(inArray(userStats.userId, userIds));

	for (const r of existing) {
		out.set(r.userId, {
			userId: r.userId,
			currentElo: r.currentElo,
			totalGames: r.totalGames,
			wins: r.wins,
			losses: r.losses,
			peakElo: r.peakElo,
		});
	}

	const missing = userIds.filter((id) => !out.has(id));
	if (missing.length > 0) {
		const seeds = missing.map((userId) => ({
			userId,
			currentElo: DEFAULT_ELO,
			totalGames: 0,
			wins: 0,
			losses: 0,
			peakElo: DEFAULT_ELO,
		}));
		await controlDb
			.insert(userStats)
			.values(seeds)
			.onConflictDoNothing({ target: userStats.userId });
		for (const seed of seeds) out.set(seed.userId, seed);
	}

	return out;
}

/**
 * Apply a single game outcome to the unified ELO ladder. Returns before/after
 * numbers for both players so callers can persist them on a `games` row.
 */
export async function applyEloOutcome(
	winnerId: string,
	loserId: string,
): Promise<{
	winnerEloBefore: number;
	winnerEloAfter: number;
	loserEloBefore: number;
	loserEloAfter: number;
}> {
	const stats = await getOrCreateUserStatsBatch([winnerId, loserId]);
	// biome-ignore lint/style/noNonNullAssertion: ensured by getOrCreateUserStatsBatch
	const winnerStats = stats.get(winnerId)!;
	// biome-ignore lint/style/noNonNullAssertion: ensured by getOrCreateUserStatsBatch
	const loserStats = stats.get(loserId)!;

	const { player1NewElo: winnerElo, player2NewElo: loserElo } =
		calculateEloChange(
			winnerStats.currentElo,
			loserStats.currentElo,
			winnerStats.totalGames,
			loserStats.totalGames,
			true,
		);

	const now = new Date();

	await controlDb
		.update(userStats)
		.set({
			currentElo: winnerElo,
			peakElo: Math.max(winnerStats.peakElo, winnerElo),
			totalGames: winnerStats.totalGames + 1,
			wins: winnerStats.wins + 1,
			lastGameAt: now,
			updatedAt: now,
		})
		.where(eq(userStats.userId, winnerId));

	await controlDb
		.update(userStats)
		.set({
			currentElo: loserElo,
			peakElo: Math.max(loserStats.peakElo, loserElo),
			totalGames: loserStats.totalGames + 1,
			losses: loserStats.losses + 1,
			lastGameAt: now,
			updatedAt: now,
		})
		.where(eq(userStats.userId, loserId));

	return {
		winnerEloBefore: winnerStats.currentElo,
		winnerEloAfter: winnerElo,
		loserEloBefore: loserStats.currentElo,
		loserEloAfter: loserElo,
	};
}
