import { desc, eq, or, sql } from "drizzle-orm";
import type { UserStats } from "~/components/profile/KPIGrid";
import { controlDb } from "~/server/db/control";
import { userStats } from "~/server/db/control-schema";
import { db } from "~/server/db/index";
import { games } from "~/server/db/schema";

export type EloHistoryPoint = { date: string; elo: number };

// Unified ELO stats for a user: control-DB `control_user_stat` row with a
// tenant-DB fallback computed from the games table, plus the ELO history of
// the last 50 games.
export async function getEloStatsForUser(
	userId: string,
): Promise<{ stats: UserStats; eloHistory: EloHistoryPoint[] }> {
	const userStatsData = await controlDb
		.select()
		.from(userStats)
		.where(eq(userStats.userId, userId))
		.limit(1);

	let stats: UserStats | undefined = userStatsData[0];

	if (!stats) {
		const userGamesStats = await db
			.select({
				totalGames: sql<number>`count(*)`,
				wins: sql<number>`sum(case when ${games.winnerId} = ${userId} then 1 else 0 end)`,
				losses: sql<number>`sum(case when ${games.winnerId} != ${userId} then 1 else 0 end)`,
				lastGameAt: sql<Date>`max(${games.playedAt})`,
			})
			.from(games)
			.where(or(eq(games.player1Id, userId), eq(games.player2Id, userId)));

		const gameStats = userGamesStats[0];

		const latestGame = await db
			.select({
				player1Id: games.player1Id,
				player1EloAfter: games.player1EloAfter,
				player2EloAfter: games.player2EloAfter,
			})
			.from(games)
			.where(or(eq(games.player1Id, userId), eq(games.player2Id, userId)))
			.orderBy(desc(games.playedAt))
			.limit(1);

		const currentElo = latestGame[0]
			? latestGame[0].player1Id === userId
				? (latestGame[0].player1EloAfter ?? 1200)
				: (latestGame[0].player2EloAfter ?? 1200)
			: 1200;

		const allUserGames = await db
			.select({
				player1Id: games.player1Id,
				player1EloAfter: games.player1EloAfter,
				player2EloAfter: games.player2EloAfter,
			})
			.from(games)
			.where(or(eq(games.player1Id, userId), eq(games.player2Id, userId)));

		const peakElo = allUserGames.reduce((peak, game) => {
			const userElo =
				game.player1Id === userId
					? (game.player1EloAfter ?? 1200)
					: (game.player2EloAfter ?? 1200);
			return Math.max(peak, userElo);
		}, 1200);

		stats = {
			userId,
			currentElo,
			totalGames: gameStats?.totalGames || 0,
			wins: gameStats?.wins || 0,
			losses: gameStats?.losses || 0,
			lastGameAt: gameStats?.lastGameAt || null,
			peakElo,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	}

	const recentGames = await db
		.select({
			playedAt: games.playedAt,
			player1Id: games.player1Id,
			player2Id: games.player2Id,
			player1EloAfter: games.player1EloAfter,
			player2EloAfter: games.player2EloAfter,
		})
		.from(games)
		.where(or(eq(games.player1Id, userId), eq(games.player2Id, userId)))
		.orderBy(desc(games.playedAt))
		.limit(50);

	const eloHistory = recentGames
		.filter((game) => game.playedAt)
		.map((game) => ({
			date: game.playedAt?.toISOString().split("T")[0] ?? "",
			elo:
				game.player1Id === userId
					? (game.player1EloAfter ?? 1200)
					: (game.player2EloAfter ?? 1200),
		}))
		.reverse();

	return { stats, eloHistory };
}
