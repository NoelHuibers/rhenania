"use server";

import { desc, eq, gt, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { games, userStats, users } from "~/server/db/schema";
import { auth } from "../auth";

export interface GameResult {
  player2Id: string;
  won: boolean;
  orderId?: string;
}

export interface GameRecord {
  id: string;
  player1Id: string;
  player2Id: string;
  player1Avatar: string | null;
  player2Avatar: string | null;
  winnerId: string;
  playedAt: Date;
  gameType: string | null;
  player1Name: string | null;
  player2Name: string | null;
  winnerName: string | null;
  player1EloBefore: number;
  player2EloBefore: number;
  player1EloAfter: number;
  player2EloAfter: number;
  eloChange: number;
}

export interface UserGameStats {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  avatar?: string | null;
  currentElo: number;
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  peakElo?: number;
}

// ELO calculation constants
const DEFAULT_ELO = 1200;
const K_FACTOR = 32; // Standard K-factor for chess
const K_FACTOR_HIGH_RATED = 16; // Lower K-factor for high-rated players (>2400)
const K_FACTOR_EXPERIENCED = 24; // Medium K-factor for experienced players (>30 games)

function calculateExpectedScore(
  playerElo: number,
  opponentElo: number
): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

function getKFactor(playerElo: number, totalGames: number): number {
  if (playerElo >= 2400) return K_FACTOR_HIGH_RATED;
  if (totalGames >= 30) return K_FACTOR_EXPERIENCED;
  return K_FACTOR;
}

function calculateEloChange(
  player1Elo: number,
  player2Elo: number,
  player1TotalGames: number,
  player2TotalGames: number,
  player1Won: boolean
): { player1NewElo: number; player2NewElo: number; eloChange: number } {
  const player1Expected = calculateExpectedScore(player1Elo, player2Elo);
  const player2Expected = calculateExpectedScore(player2Elo, player1Elo);
  const player1Score = player1Won ? 1 : 0;
  const player2Score = player1Won ? 0 : 1;
  const player1KFactor = getKFactor(player1Elo, player1TotalGames);
  const player2KFactor = getKFactor(player2Elo, player2TotalGames);
  const player1Change = Math.round(
    player1KFactor * (player1Score - player1Expected)
  );
  const player2Change = Math.round(
    player2KFactor * (player2Score - player2Expected)
  );

  return {
    player1NewElo: player1Elo + player1Change,
    player2NewElo: player2Elo + player2Change,
    eloChange: Math.abs(player1Change),
  };
}

// Create a new game record with proper ELO calculation
export async function createGame(gameData: GameResult): Promise<{
  success: boolean;
  error?: string;
  gameId?: string;
  eloChange?: number;
}> {
  const session = await auth();
  if (!session) {
    return { success: false, error: "User not authenticated" };
  }

  try {
    const userId = session.user.id;

    // Validate that player1 and player2 are different
    if (userId === gameData.player2Id) {
      return {
        success: false,
        error: "A player cannot play against themselves",
      };
    }

    // Get current stats for both players
    const player1Stats = await getUserStats(userId);
    const player2Stats = await getUserStats(gameData.player2Id);

    if (!player1Stats || !player2Stats) {
      return { success: false, error: "Failed to retrieve player statistics" };
    }

    // Calculate new ELO ratings
    const eloCalculation = calculateEloChange(
      player1Stats.currentElo,
      player2Stats.currentElo,
      player1Stats.totalGames,
      player2Stats.totalGames,
      gameData.won
    );

    // Start transaction to ensure data consistency
    const [newGame] = await db
      .insert(games)
      .values({
        player1Id: userId,
        player2Id: gameData.player2Id,
        winnerId: gameData.won ? userId : gameData.player2Id,
        orderId: gameData.orderId,
        player1EloBefore: player1Stats.currentElo,
        player2EloBefore: player2Stats.currentElo,
        player1EloAfter: eloCalculation.player1NewElo,
        player2EloAfter: eloCalculation.player2NewElo,
      })
      .returning({ id: games.id });

    if (!newGame) {
      return { success: false, error: "Failed to create game record" };
    }

    await updateUserStats(
      userId,
      gameData.won,
      eloCalculation.player1NewElo,
      player1Stats.currentElo
    );
    await updateUserStats(
      gameData.player2Id,
      !gameData.won,
      eloCalculation.player2NewElo,
      player2Stats.currentElo
    );

    revalidatePath(`/eloranking`);

    return {
      success: true,
      gameId: newGame.id,
      eloChange: eloCalculation.eloChange,
    };
  } catch (error) {
    console.error("Error creating game:", error);
    return { success: false, error: "Failed to create game record" };
  }
}

// Get or create user stats
export async function getUserStats(
  userId: string
): Promise<UserGameStats | null> {
  try {
    const existingStats = await db
      .select({
        userId: userStats.userId,
        userName: users.name,
        userEmail: users.email,
        currentElo: userStats.currentElo,
        totalGames: userStats.totalGames,
        wins: userStats.wins,
        losses: userStats.losses,
        peakElo: userStats.peakElo,
      })
      .from(userStats)
      .leftJoin(users, eq(userStats.userId, users.id))
      .where(eq(userStats.userId, userId))
      .limit(1);

    if (existingStats.length > 0) {
      const stats = existingStats[0]!;
      return {
        userId: stats.userId,
        userName: stats.userName,
        userEmail: stats.userEmail,
        currentElo: stats.currentElo,
        totalGames: stats.totalGames,
        wins: stats.wins,
        losses: stats.losses,
        winRate:
          stats.totalGames > 0 ? (stats.wins / stats.totalGames) * 100 : 0,
        peakElo: stats.peakElo || stats.currentElo,
      };
    }

    // Create new stats record
    await db.insert(userStats).values({
      userId,
      currentElo: DEFAULT_ELO,
      totalGames: 0,
      wins: 0,
      losses: 0,
      peakElo: DEFAULT_ELO,
    });

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return {
      userId,
      userName: user[0]?.name || null,
      userEmail: user[0]?.email || null,
      currentElo: DEFAULT_ELO,
      totalGames: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      peakElo: DEFAULT_ELO,
    };
  } catch (error) {
    console.error("Error getting user stats:", error);
    return null;
  }
}

// Update user stats after a game
async function updateUserStats(
  userId: string,
  won: boolean,
  newElo: number,
  previousElo: number
): Promise<void> {
  try {
    const currentStats = await getUserStats(userId);

    if (currentStats) {
      const newPeakElo = Math.max(currentStats.peakElo || 0, newElo);

      await db
        .update(userStats)
        .set({
          currentElo: newElo,
          totalGames: currentStats.totalGames + 1,
          wins: won ? currentStats.wins + 1 : currentStats.wins,
          losses: won ? currentStats.losses : currentStats.losses + 1,
          peakElo: newPeakElo,
          lastGameAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(userStats.userId, userId));
    }
  } catch (error) {
    console.error("Error updating user stats:", error);
  }
}

// Get recent games with ELO information
export async function getRecentGames(
  limit: number = 10
): Promise<GameRecord[]> {
  try {
    const recentGames = await db
      .select({
        id: games.id,
        player1Id: games.player1Id,
        player2Id: games.player2Id,
        winnerId: games.winnerId,
        playedAt: games.playedAt,
        gameType: games.gameType,
        player1EloBefore: games.player1EloBefore,
        player2EloBefore: games.player2EloBefore,
        player1EloAfter: games.player1EloAfter,
        player2EloAfter: games.player2EloAfter,
      })
      .from(games)
      .orderBy(desc(games.playedAt))
      .limit(limit);

    // Get user names for each game
    const gamesWithNames = await Promise.all(
      recentGames.map(async (game) => {
        const [player1, player2, winner] = await Promise.all([
          db
            .select({ name: users.name, avatar: users.image })
            .from(users)
            .where(eq(users.id, game.player1Id))
            .limit(1),
          db
            .select({ name: users.name, avatar: users.image })
            .from(users)
            .where(eq(users.id, game.player2Id))
            .limit(1),
          db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, game.winnerId))
            .limit(1),
        ]);

        // Calculate ELO change for display
        const player1Won = game.winnerId === game.player1Id;
        const eloChange = Math.abs(
          player1Won
            ? (game.player1EloAfter ?? 0) - (game.player1EloBefore ?? 0)
            : (game.player2EloAfter ?? 0) - (game.player2EloBefore ?? 0)
        );

        return {
          ...game,
          player1Name: player1[0]?.name || null,
          player2Name: player2[0]?.name || null,
          player1Avatar: player1[0]?.avatar || null,
          player2Avatar: player2[0]?.avatar || null,
          winnerName: winner[0]?.name || null,
          player1EloBefore: game.player1EloBefore ?? DEFAULT_ELO,
          player2EloBefore: game.player2EloBefore ?? DEFAULT_ELO,
          player1EloAfter: game.player1EloAfter ?? DEFAULT_ELO,
          player2EloAfter: game.player2EloAfter ?? DEFAULT_ELO,
          eloChange,
        };
      })
    );

    return gamesWithNames;
  } catch (error) {
    console.error("Error getting recent games:", error);
    return [];
  }
}

// Get games for a specific user
export async function getUserGames(
  userId: string,
  limit: number = 20
): Promise<GameRecord[]> {
  try {
    const userGames = await db
      .select({
        id: games.id,
        player1Id: games.player1Id,
        player2Id: games.player2Id,
        winnerId: games.winnerId,
        playedAt: games.playedAt,
        gameType: games.gameType,
        player1EloBefore: games.player1EloBefore,
        player2EloBefore: games.player2EloBefore,
        player1EloAfter: games.player1EloAfter,
        player2EloAfter: games.player2EloAfter,
      })
      .from(games)
      .where(or(eq(games.player1Id, userId), eq(games.player2Id, userId)))
      .orderBy(desc(games.playedAt))
      .limit(limit);

    // Get user names for each game
    const gamesWithNames = await Promise.all(
      userGames.map(async (game) => {
        const [player1, player2, winner] = await Promise.all([
          db
            .select({ name: users.name, avatar: users.image })
            .from(users)
            .where(eq(users.id, game.player1Id))
            .limit(1),
          db
            .select({ name: users.name, avatar: users.image })
            .from(users)
            .where(eq(users.id, game.player2Id))
            .limit(1),
          db
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, game.winnerId))
            .limit(1),
        ]);

        // Calculate ELO change for the specific user
        const isPlayer1 = game.player1Id === userId;
        const eloChange = Math.abs(
          isPlayer1
            ? (game.player1EloAfter ?? 0) - (game.player1EloBefore ?? 0)
            : (game.player2EloAfter ?? 0) - (game.player2EloBefore ?? 0)
        );

        return {
          ...game,
          player1Name: player1[0]?.name || null,
          player2Name: player2[0]?.name || null,
          player1Avatar: player1[0]?.avatar || null,
          player2Avatar: player2[0]?.avatar || null,
          winnerName: winner[0]?.name || null,
          player1EloBefore: game.player1EloBefore ?? DEFAULT_ELO,
          player2EloBefore: game.player2EloBefore ?? DEFAULT_ELO,
          player1EloAfter: game.player1EloAfter ?? DEFAULT_ELO,
          player2EloAfter: game.player2EloAfter ?? DEFAULT_ELO,
          eloChange,
        };
      })
    );

    return gamesWithNames;
  } catch (error) {
    console.error("Error getting user games:", error);
    return [];
  }
}

// Get leaderboard (top players by ELO)
export async function getLeaderboard(
  limit: number = 10
): Promise<UserGameStats[]> {
  try {
    const topPlayers = await db
      .select({
        userId: userStats.userId,
        userName: users.name,
        userEmail: users.email,
        currentElo: userStats.currentElo,
        totalGames: userStats.totalGames,
        wins: userStats.wins,
        losses: userStats.losses,
        peakElo: userStats.peakElo,
        avatar: users.image,
      })
      .from(userStats)
      .leftJoin(users, eq(userStats.userId, users.id))
      .where(gt(userStats.totalGames, 0)) // Only players with at least 1 game
      .orderBy(desc(userStats.currentElo))
      .limit(limit);

    return topPlayers.map((stats) => ({
      userId: stats.userId,
      userName: stats.userName,
      userEmail: stats.userEmail,
      avatar: stats.avatar,
      currentElo: stats.currentElo,
      totalGames: stats.totalGames,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.totalGames > 0 ? (stats.wins / stats.totalGames) * 100 : 0,
      peakElo: stats.peakElo || stats.currentElo,
    }));
  } catch (error) {
    console.error("Error getting leaderboard:", error);
    return [];
  }
}

// Get ELO history for a user (useful for charts)
export async function getUserEloHistory(
  userId: string,
  limit: number = 50
): Promise<
  {
    gameId: string;
    eloAfter: number;
    playedAt: Date;
    won: boolean;
    opponent: string;
  }[]
> {
  try {
    const userGames = await db
      .select({
        id: games.id,
        player1Id: games.player1Id,
        player2Id: games.player2Id,
        winnerId: games.winnerId,
        playedAt: games.playedAt,
        player1EloAfter: games.player1EloAfter,
        player2EloAfter: games.player2EloAfter,
      })
      .from(games)
      .where(or(eq(games.player1Id, userId), eq(games.player2Id, userId)))
      .orderBy(desc(games.playedAt))
      .limit(limit);

    const history = await Promise.all(
      userGames.map(async (game) => {
        const isPlayer1 = game.player1Id === userId;
        const opponentId = isPlayer1 ? game.player2Id : game.player1Id;

        const opponent = await db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, opponentId))
          .limit(1);

        return {
          gameId: game.id,
          eloAfter: isPlayer1
            ? game.player1EloAfter ?? 0
            : game.player2EloAfter ?? 0,
          playedAt: game.playedAt,
          won: game.winnerId === userId,
          opponent: opponent[0]?.name || "Unknown",
        };
      })
    );

    return history.reverse(); // Return in chronological order
  } catch (error) {
    console.error("Error getting user ELO history:", error);
    return [];
  }
}

// Calculate what ELO change would result from a hypothetical game
export async function calculateHypotheticalEloChange(
  player1Elo: number,
  player2Elo: number,
  player1TotalGames: number = 0,
  player2TotalGames: number = 0
): Promise<{
  player1WinChange: number;
  player1LossChange: number;
  player2WinChange: number;
  player2LossChange: number;
}> {
  const player1Wins = calculateEloChange(
    player1Elo,
    player2Elo,
    player1TotalGames,
    player2TotalGames,
    true
  );
  const player1Loses = calculateEloChange(
    player1Elo,
    player2Elo,
    player1TotalGames,
    player2TotalGames,
    false
  );

  return {
    player1WinChange: player1Wins.player1NewElo - player1Elo,
    player1LossChange: player1Loses.player1NewElo - player1Elo,
    player2WinChange: player1Loses.player2NewElo - player2Elo,
    player2LossChange: player1Wins.player2NewElo - player2Elo,
  };
}
