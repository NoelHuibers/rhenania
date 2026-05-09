"use server";

import { and, desc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { controlDb } from "~/server/db/control";
import { userStats } from "~/server/db/control-schema";
import { games, userPreferences, users } from "~/server/db/schema";
import { applyEloOutcome, getOrCreateUserStats } from "~/server/lib/user-stats";
import { auth } from "../../auth";
import { checkAndUnlockAchievements } from "../achievements/tracking";

const ELO_KEY = "gamification.eloEnabled";
const FALSE_JSON = JSON.stringify(false); // stored as "false"

async function isEloEnabled(userId: string) {
	const row = await db
		.select({ value: userPreferences.value })
		.from(userPreferences)
		.where(
			and(eq(userPreferences.userId, userId), eq(userPreferences.key, ELO_KEY)),
		)
		.limit(1);

	// default = enabled (no pref row)
	return row.length === 0 ? true : row[0]?.value !== FALSE_JSON;
}

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
	opponentElo: number,
): number {
	return 1 / (1 + 10 ** ((opponentElo - playerElo) / 400));
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
	player1Won: boolean,
): { player1NewElo: number; player2NewElo: number; eloChange: number } {
	const player1Expected = calculateExpectedScore(player1Elo, player2Elo);
	const player2Expected = calculateExpectedScore(player2Elo, player1Elo);
	const player1Score = player1Won ? 1 : 0;
	const player2Score = player1Won ? 0 : 1;
	const player1KFactor = getKFactor(player1Elo, player1TotalGames);
	const player2KFactor = getKFactor(player2Elo, player2TotalGames);
	const player1Change = Math.round(
		player1KFactor * (player1Score - player1Expected),
	);
	const player2Change = Math.round(
		player2KFactor * (player2Score - player2Expected),
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

		const [p1Enabled, p2Enabled] = await Promise.all([
			isEloEnabled(userId),
			isEloEnabled(gameData.player2Id),
		]);

		if (!p1Enabled || !p2Enabled) {
			return {
				success: false,
				error: "One of the players has opted out of Elo games.",
			};
		}

		const winnerId = gameData.won ? userId : gameData.player2Id;
		const loserId = gameData.won ? gameData.player2Id : userId;

		// Apply ELO outcome against the unified userStats (control DB).
		const eloResult = await applyEloOutcome(winnerId, loserId);
		const player1EloBefore = gameData.won
			? eloResult.winnerEloBefore
			: eloResult.loserEloBefore;
		const player2EloBefore = gameData.won
			? eloResult.loserEloBefore
			: eloResult.winnerEloBefore;
		const player1EloAfter = gameData.won
			? eloResult.winnerEloAfter
			: eloResult.loserEloAfter;
		const player2EloAfter = gameData.won
			? eloResult.loserEloAfter
			: eloResult.winnerEloAfter;

		const [newGame] = await db
			.insert(games)
			.values({
				player1Id: userId,
				player2Id: gameData.player2Id,
				winnerId,
				orderId: gameData.orderId,
				player1EloBefore,
				player2EloBefore,
				player1EloAfter,
				player2EloAfter,
			})
			.returning({ id: games.id });

		if (!newGame) {
			return { success: false, error: "Failed to create game record" };
		}

		revalidatePath(`/eloranking`);

		void Promise.all([
			checkAndUnlockAchievements(userId, "game_played"),
			checkAndUnlockAchievements(gameData.player2Id, "game_played"),
			checkAndUnlockAchievements(winnerId, "game_won"),
			checkAndUnlockAchievements(loserId, "game_lost"),
		]);

		return {
			success: true,
			gameId: newGame.id,
			eloChange: Math.abs(eloResult.winnerEloAfter - eloResult.winnerEloBefore),
		};
	} catch (error) {
		console.error("Error creating game:", error);
		return { success: false, error: "Failed to create game record" };
	}
}

// Get or create user stats. ELO/W-L numbers come from the unified control-DB
// userStats; name/email come from the tenant `users` mirror.
export async function getUserStats(
	userId: string,
): Promise<UserGameStats | null> {
	try {
		const [stats, user] = await Promise.all([
			getOrCreateUserStats(userId),
			db
				.select({ name: users.name, email: users.email })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1)
				.then((rows) => rows[0] ?? null),
		]);

		return {
			userId,
			userName: user?.name ?? null,
			userEmail: user?.email ?? null,
			currentElo: stats.currentElo,
			totalGames: stats.totalGames,
			wins: stats.wins,
			losses: stats.losses,
			winRate: stats.totalGames > 0 ? (stats.wins / stats.totalGames) * 100 : 0,
			peakElo: stats.peakElo || stats.currentElo,
		};
	} catch (error) {
		console.error("Error getting user stats:", error);
		return null;
	}
}

// `updateUserStats` removed — `applyEloOutcome` from `~/server/lib/user-stats`
// handles updating both players atomically.

// Get recent games with ELO information
export async function getRecentGames(
	limit: number = 10,
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
						: (game.player2EloAfter ?? 0) - (game.player2EloBefore ?? 0),
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
			}),
		);

		const filtered = [];
		for (let i = 0; i < recentGames.length; i++) {
			// biome-ignore lint/style/noNonNullAssertion: within loop bounds
			const g = recentGames[i]!;
			const [p1, p2] = await Promise.all([
				isEloEnabled(g.player1Id),
				isEloEnabled(g.player2Id),
			]);
			// biome-ignore lint/style/noNonNullAssertion: within loop bounds
			if (p1 && p2) filtered.push(gamesWithNames[i]!);
		}

		return filtered;
	} catch (error) {
		console.error("Error getting recent games:", error);
		return [];
	}
}

// Get games for a specific user
export async function getUserGames(
	userId: string,
	limit: number = 20,
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
						: (game.player2EloAfter ?? 0) - (game.player2EloBefore ?? 0),
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
			}),
		);

		return gamesWithNames;
	} catch (error) {
		console.error("Error getting user games:", error);
		return [];
	}
}

// Get leaderboard (top players by ELO)
export async function getLeaderboard(
	limit: number = 10,
	offset: number = 0,
): Promise<UserGameStats[]> {
	try {
		// Internal leaderboard: members of the current tenant, ranked by their
		// unified ELO from the control DB. Two-step query because tenant `users`
		// (mirror) and `userPreferences` live in the tenant DB while `userStats`
		// lives in the control DB.

		// 1. Tenant-side: members + their ELO opt-out preference.
		const tenantMembers = await db
			.select({
				userId: users.id,
				userName: users.name,
				userEmail: users.email,
				avatar: users.image,
				prefValue: userPreferences.value,
			})
			.from(users)
			.leftJoin(
				userPreferences,
				and(
					eq(userPreferences.userId, users.id),
					eq(userPreferences.key, ELO_KEY),
				),
			)
			.where(
				or(
					isNull(userPreferences.value),
					ne(userPreferences.value, FALSE_JSON),
				),
			);

		const memberIds = tenantMembers.map((m) => m.userId);
		if (memberIds.length === 0) return [];

		// 2. Control-side: stats for those members, ordered by ELO.
		const stats = await controlDb
			.select()
			.from(userStats)
			.where(
				and(inArray(userStats.userId, memberIds), gt(userStats.totalGames, 0)),
			)
			.orderBy(desc(userStats.currentElo))
			.limit(limit + offset);

		const memberById = new Map(tenantMembers.map((m) => [m.userId, m]));
		const ranked = stats.slice(offset, offset + limit);

		return ranked.map((s) => {
			const m = memberById.get(s.userId);
			return {
				userId: s.userId,
				userName: m?.userName ?? null,
				userEmail: m?.userEmail ?? null,
				avatar: m?.avatar ?? null,
				currentElo: s.currentElo,
				totalGames: s.totalGames,
				wins: s.wins,
				losses: s.losses,
				winRate: s.totalGames > 0 ? (s.wins / s.totalGames) * 100 : 0,
				peakElo: s.peakElo || s.currentElo,
			};
		});
	} catch (error) {
		console.error("Error getting leaderboard:", error);
		return [];
	}
}

// Get ELO history for a user (useful for charts)
export async function getUserEloHistory(
	userId: string,
	limit: number = 50,
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
						? (game.player1EloAfter ?? 0)
						: (game.player2EloAfter ?? 0),
					playedAt: game.playedAt,
					won: game.winnerId === userId,
					opponent: opponent[0]?.name || "Unknown",
				};
			}),
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
	player2TotalGames: number = 0,
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
		true,
	);
	const player1Loses = calculateEloChange(
		player1Elo,
		player2Elo,
		player1TotalGames,
		player2TotalGames,
		false,
	);

	return {
		player1WinChange: player1Wins.player1NewElo - player1Elo,
		player1LossChange: player1Loses.player1NewElo - player1Elo,
		player2WinChange: player1Loses.player2NewElo - player2Elo,
		player2LossChange: player1Wins.player2NewElo - player2Elo,
	};
}
