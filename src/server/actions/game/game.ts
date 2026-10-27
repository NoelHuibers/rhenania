"use server";

import { and, desc, eq, gt, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "~/server/db";
import { controlDb } from "~/server/db/control";
import { userStats } from "~/server/db/control-schema";
import { games, userPreferences, users } from "~/server/db/schema";
import { requireMember } from "~/server/lib/authz";

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

// Rating used when a game row has no ELO values.
const DEFAULT_ELO = 1200;

// `updateUserStats` removed — `applyEloOutcome` from `~/server/lib/user-stats`
// handles updating both players atomically.

// Get recent games with ELO information
export async function getRecentGames(
	limit: number = 10,
): Promise<GameRecord[]> {
	await requireMember();
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

		const filtered: typeof gamesWithNames = [];
		for (const [i, g] of recentGames.entries()) {
			const withNames = gamesWithNames[i];
			if (!withNames) {
				continue;
			}
			const [p1, p2] = await Promise.all([
				isEloEnabled(g.player1Id),
				isEloEnabled(g.player2Id),
			]);
			if (p1 && p2) {
				filtered.push(withNames);
			}
		}

		return filtered;
	} catch (error) {
		console.error("Error getting recent games:", error);
		return [];
	}
}

// Get leaderboard (top players by ELO)
export async function getLeaderboard(
	limit: number = 10,
	offset: number = 0,
): Promise<UserGameStats[]> {
	await requireMember();
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
		if (memberIds.length === 0) {
			return [];
		}

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
