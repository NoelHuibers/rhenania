// user-stats.ts — read/update each user's unified ELO + W/L stats.
//
// `userStats` lives in the control DB, so a user with memberships in multiple
// Corps has a single ELO across all of them. Both intra-Corps and cross-Corps
// games go through `applyEloOutcome`.

import { and, eq, inArray, sql } from "drizzle-orm";

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
	if (userIds.length === 0) {
		return out;
	}

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
		for (const seed of seeds) {
			out.set(seed.userId, seed);
		}
	}

	return out;
}

export type EloOutcome = {
	winnerEloBefore: number;
	winnerEloAfter: number;
	loserEloBefore: number;
	loserEloAfter: number;
};

// Optimistic retries before giving up. Each retry means another game of one
// of the two players was booked in between, so a handful is plenty.
const MAX_ELO_ATTEMPTS = 8;

/**
 * Apply a single game outcome to the unified ELO ladder. Returns before/after
 * numbers for both players so callers can persist them on a `games` row.
 *
 * Both rows change in ONE statement, so a failure never leaves one player
 * updated without the other. The new ELO depends on both players' current
 * ELO and game count; the statement only applies if neither changed since
 * they were read (optimistic concurrency) and is retried otherwise, so two
 * games of the same player at once end exactly as if booked one after the
 * other. Counters are SQL increments.
 */
export async function applyEloOutcome(
	winnerId: string,
	loserId: string,
): Promise<EloOutcome> {
	for (let attempt = 0; attempt < MAX_ELO_ATTEMPTS; attempt++) {
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

		const isWinner = sql`${userStats.userId} = ${winnerId}`;
		const newElo = sql`CASE WHEN ${isWinner} THEN ${winnerElo} ELSE ${loserElo} END`;
		// Non-correlated, so SQLite evaluates it once against the rows as they
		// were before this statement: either both rows match or neither does.
		const bothUnchanged = sql`(
			SELECT COUNT(*) FROM ${userStats} AS s
			WHERE (s."userId" = ${winnerId} AND s."currentElo" = ${winnerStats.currentElo} AND s."totalGames" = ${winnerStats.totalGames})
			   OR (s."userId" = ${loserId} AND s."currentElo" = ${loserStats.currentElo} AND s."totalGames" = ${loserStats.totalGames})
		) = 2`;
		const now = new Date();

		const updated = await controlDb
			.update(userStats)
			.set({
				currentElo: newElo,
				peakElo: sql`MAX(${userStats.peakElo}, ${newElo})`,
				totalGames: sql`${userStats.totalGames} + 1`,
				wins: sql`${userStats.wins} + CASE WHEN ${isWinner} THEN 1 ELSE 0 END`,
				losses: sql`${userStats.losses} + CASE WHEN ${isWinner} THEN 0 ELSE 1 END`,
				lastGameAt: now,
				updatedAt: now,
			})
			.where(and(inArray(userStats.userId, [winnerId, loserId]), bothUnchanged))
			.returning({ userId: userStats.userId });

		if (updated.length === 2) {
			return {
				winnerEloBefore: winnerStats.currentElo,
				winnerEloAfter: winnerElo,
				loserEloBefore: loserStats.currentElo,
				loserEloAfter: loserElo,
			};
		}
	}
	throw new Error("ELO update conflicted too often, please retry");
}

/**
 * Compensates an `applyEloOutcome` whose game could not be recorded: takes
 * the ELO delta and the counters back off both players in one statement.
 * Relative, so games booked in between stay intact. The peak ELO is left as
 * is (the previous peak isn't known any more).
 */
export async function revertEloOutcome(
	winnerId: string,
	loserId: string,
	outcome: EloOutcome,
): Promise<void> {
	const isWinner = sql`${userStats.userId} = ${winnerId}`;
	const winnerDelta = outcome.winnerEloAfter - outcome.winnerEloBefore;
	const loserDelta = outcome.loserEloAfter - outcome.loserEloBefore;
	await controlDb
		.update(userStats)
		.set({
			currentElo: sql`${userStats.currentElo} - CASE WHEN ${isWinner} THEN ${winnerDelta} ELSE ${loserDelta} END`,
			totalGames: sql`${userStats.totalGames} - 1`,
			wins: sql`${userStats.wins} - CASE WHEN ${isWinner} THEN 1 ELSE 0 END`,
			losses: sql`${userStats.losses} - CASE WHEN ${isWinner} THEN 0 ELSE 1 END`,
			updatedAt: new Date(),
		})
		.where(inArray(userStats.userId, [winnerId, loserId]));
}
