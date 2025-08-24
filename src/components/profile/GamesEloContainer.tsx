// GamesEloContainerDetailed.tsx
import { and, desc, eq, or, sql } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db/index";
import { games, userPreferences, userStats } from "~/server/db/schema";
import EloDisabledCard from "./EloDisabledCard";
import { GamesElo } from "./GamesElo";

const ELO_KEY = "gamification.eloEnabled";

export default async function GamesEloContainerDetailed() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("User must be authenticated to view game statistics");
  }
  const userId = session.user.id;

  const prefRow = await db
    .select({ value: userPreferences.value })
    .from(userPreferences)
    .where(
      and(eq(userPreferences.userId, userId), eq(userPreferences.key, ELO_KEY))
    )
    .limit(1);

  const eloEnabled =
    prefRow.length === 0
      ? true
      : (JSON.parse(prefRow[0]!.value) as boolean) === true;

  if (!eloEnabled) {
    return <EloDisabledCard />;
  }

  const userStatsData = await db
    .select()
    .from(userStats)
    .where(eq(userStats.userId, userId))
    .limit(1);

  let stats = userStatsData[0];

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
        ? latestGame[0].player1EloAfter!
        : latestGame[0].player2EloAfter!
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
          ? game.player1EloAfter!
          : game.player2EloAfter!;
      return Math.max(peak, userElo);
    }, 1200);

    stats = {
      id: "",
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
      date: game.playedAt!.toISOString().split("T")[0]!,
      elo:
        game.player1Id === userId
          ? game.player1EloAfter!
          : game.player2EloAfter!,
    }))
    .reverse();

  return <GamesElo userStats={stats} eloHistory={eloHistory} />;
}
