// repo.ts — the games in a Corps' own DB (#33).
//
// Intra-Corps challenges, played games, and the member, drink and
// preference rows the challenges, the Eloranking and the profile's ELO card
// read. Every function takes the database it runs on; none checks the
// caller, applies a rule or revalidates a page. A read that may find
// nothing returns null or []; a failed query throws.

import "server-only";

import {
	and,
	desc,
	eq,
	inArray,
	isNull,
	lt,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
	challenges,
	drinks,
	games,
	orders,
	userPreferences,
	users,
} from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";
import { ELO_PREFERENCE_KEY } from "~/server/lib/elo-preference";

export type Challenge = typeof challenges.$inferSelect;
type GameInsert = typeof games.$inferInsert;
type OrderInsert = typeof orders.$inferInsert;

/** The stored ELO opt-out: the preference value `false`. */
const FALSE_JSON = JSON.stringify(false);

/** Statuses of a challenge that is still running. */
export const OPEN_STATUSES = [
	"pending",
	"accepted",
	"result_proposed",
] as const;
// Once a result is proposed it can only be confirmed or disputed (#142):
// otherwise the reported loser could cancel and skip the drinks.
export const CANCELLABLE_STATUSES = ["pending", "accepted"] as const;

// ─── Challenges ──────────────────────────────────────────────────────────────

export async function challengeById(
	db: TenantDb,
	challengeId: string,
): Promise<Challenge | null> {
	const row = await db.query.challenges.findFirst({
		where: (t, { eq }) => eq(t.id, challengeId),
	});
	return row ?? null;
}

/** The players and status of a challenge, null if there is none. */
export async function challengePlayers(db: TenantDb, challengeId: string) {
	const row = await db.query.challenges.findFirst({
		where: (t, { eq }) => eq(t.id, challengeId),
		columns: {
			id: true,
			proposedById: true,
			challengerId: true,
			opponentId: true,
			status: true,
		},
	});
	return row ?? null;
}

/** The drink a challenge is played for: does it exist, is it available. */
export async function drinkAvailability(db: TenantDb, drinkId: string) {
	const drink = await db.query.drinks.findFirst({
		where: (t, { eq }) => eq(t.id, drinkId),
		columns: { id: true, isCurrentlyAvailable: true },
	});
	return drink ?? null;
}

/** Whether an open challenge from `challengerId` to `opponentId` exists. */
export async function hasOpenChallenge(
	db: TenantDb,
	challengerId: string,
	opponentId: string,
): Promise<boolean> {
	const existing = await db.query.challenges.findFirst({
		where: (t, { and, eq, inArray }) =>
			and(
				eq(t.challengerId, challengerId),
				eq(t.opponentId, opponentId),
				inArray(t.status, [...OPEN_STATUSES]),
			),
		columns: { id: true },
	});
	return Boolean(existing);
}

/** Whether `opponentId` declined a challenge of `challengerId` after `since`. */
export async function declinedSince(
	db: TenantDb,
	challengerId: string,
	opponentId: string,
	since: Date,
): Promise<boolean> {
	const recent = await db.query.challenges.findFirst({
		where: (t, { and, eq, gt }) =>
			and(
				eq(t.challengerId, challengerId),
				eq(t.opponentId, opponentId),
				eq(t.status, "declined"),
				gt(t.declinedAt, since),
			),
		columns: { declinedAt: true },
		orderBy: (t, { desc }) => [desc(t.declinedAt)],
	});
	return Boolean(recent);
}

export async function insertChallenge(
	db: TenantDb,
	values: typeof challenges.$inferInsert,
): Promise<string> {
	const [row] = await db
		.insert(challenges)
		.values(values)
		.returning({ id: challenges.id });
	if (!row) {
		throw new Error("challenge insert returned no row");
	}
	return row.id;
}

/** Changes a challenge, whatever its status. */
export async function updateChallenge(
	db: TenantDb,
	challengeId: string,
	set: Partial<typeof challenges.$inferInsert>,
): Promise<void> {
	await db.update(challenges).set(set).where(eq(challenges.id, challengeId));
}

/**
 * Changes a challenge only while its status is one of `from`; true if it
 * did. Of concurrent callers at most one moves it.
 */
export async function moveChallenge(
	db: TenantDb,
	challengeId: string,
	from: readonly Challenge["status"][],
	set: Partial<typeof challenges.$inferInsert>,
): Promise<boolean> {
	const [moved] = await db
		.update(challenges)
		.set(set)
		.where(
			and(
				eq(challenges.id, challengeId),
				from.length === 1
					? eq(challenges.status, from[0] as Challenge["status"])
					: inArray(challenges.status, [...from]),
			),
		)
		.returning({ id: challenges.id });
	return Boolean(moved);
}

/**
 * Atomically moves a proposed result into settlement. Of any number of
 * concurrent callers (double-tapped confirm, two auto-settle sweeps) exactly
 * one gets the row back; everyone else gets null and books nothing.
 */
export async function claimProposedResult(
	db: TenantDb,
	challengeId: string,
): Promise<Challenge | null> {
	const [row] = await db
		.update(challenges)
		.set({ status: "confirmed" })
		.where(
			and(
				eq(challenges.id, challengeId),
				eq(challenges.status, "result_proposed"),
			),
		)
		.returning();
	return row ?? null;
}

/** Hands a claimed challenge back so the result can be confirmed again. */
export async function releaseClaim(
	db: TenantDb,
	challengeId: string,
): Promise<void> {
	await db
		.update(challenges)
		.set({ status: "result_proposed" })
		.where(
			and(eq(challenges.id, challengeId), eq(challenges.status, "confirmed")),
		);
}

/** What settling a challenge reads: the drink and both players. */
export async function settlementRows(
	db: TenantDb,
	drinkId: string,
	winnerId: string,
	loserId: string,
) {
	const player = (id: string) =>
		db.query.users.findFirst({
			where: (t, { eq }) => eq(t.id, id),
			columns: { id: true, name: true, email: true },
		});
	const [drink, winner, loser] = await Promise.all([
		db.query.drinks.findFirst({ where: (t, { eq }) => eq(t.id, drinkId) }),
		player(winnerId),
		player(loserId),
	]);
	return { drink: drink ?? null, winner: winner ?? null, loser: loser ?? null };
}

/** The game row, the settled status and the drinks, all or nothing. */
export async function bookSettlement(
	db: TenantDb,
	challengeId: string,
	game: GameInsert & { id: string },
	orderRows: OrderInsert[],
): Promise<void> {
	await db.batch([
		db.insert(games).values(game),
		db
			.update(challenges)
			.set({ status: "settled", gameId: game.id })
			.where(
				and(eq(challenges.id, challengeId), eq(challenges.status, "confirmed")),
			),
		...orderRows.map((o) => db.insert(orders).values(o)),
	]);
}

/** Conditions of the challenges whose deadline passed at `now`. */
function missedDeadlines(now: Date) {
	return {
		respond: and(
			eq(challenges.status, "pending"),
			lt(challenges.respondDeadline, now),
		),
		play: and(
			eq(challenges.status, "accepted"),
			lt(challenges.playDeadline, now),
		),
		confirm: and(
			eq(challenges.status, "result_proposed"),
			lt(challenges.confirmDeadline, now),
		),
	};
}

/** Challenges whose deadline passed (one indexed read). */
export async function dueChallenges(db: TenantDb, now: Date) {
	const missed = missedDeadlines(now);
	return db
		.select({ id: challenges.id, status: challenges.status })
		.from(challenges)
		.where(or(missed.respond, missed.play, missed.confirm));
}

/**
 * Expires unanswered and unplayed challenges. The UPDATE re-checks both
 * deadlines, so a reply landing meanwhile is kept.
 */
export async function expireMissedChallenges(
	db: TenantDb,
	now: Date,
): Promise<void> {
	const missed = missedDeadlines(now);
	await db
		.update(challenges)
		.set({ status: "expired" })
		.where(or(missed.respond, missed.play));
}

/** The user's latest 100 challenges with drink and both players, newest first. */
export async function challengeFeedRows(db: TenantDb, userId: string) {
	const challenger = alias(users, "challenger");
	const opponent = alias(users, "opponent");
	return db
		.select({
			id: challenges.id,
			status: challenges.status,
			payment: challenges.payment,
			quantity: challenges.quantity,
			drinkId: challenges.drinkId,
			drinkName: drinks.name,
			drinkPrice: drinks.price,
			challengerId: challenges.challengerId,
			challengerName: challenger.name,
			challengerAvatar: challenger.image,
			opponentId: challenges.opponentId,
			opponentName: opponent.name,
			opponentAvatar: opponent.image,
			proposedWinnerId: challenges.proposedWinnerId,
			proposedById: challenges.proposedById,
			createdAt: challenges.createdAt,
			acceptedAt: challenges.acceptedAt,
			respondDeadline: challenges.respondDeadline,
			playDeadline: challenges.playDeadline,
			confirmDeadline: challenges.confirmDeadline,
			gameId: challenges.gameId,
		})
		.from(challenges)
		.leftJoin(drinks, eq(challenges.drinkId, drinks.id))
		.leftJoin(challenger, eq(challenges.challengerId, challenger.id))
		.leftJoin(opponent, eq(challenges.opponentId, opponent.id))
		.where(
			or(
				eq(challenges.challengerId, userId),
				eq(challenges.opponentId, userId),
			),
		)
		.orderBy(desc(challenges.createdAt))
		.limit(100);
}

// ─── Played games ────────────────────────────────────────────────────────────

/** The latest `limit` games with their ELO values, newest first. */
export async function recentGames(db: TenantDb, limit: number) {
	return db
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
}

/** A player's name and picture (one query per call). */
export async function playerCard(db: TenantDb, userId: string) {
	const [row] = await db
		.select({ name: users.name, avatar: users.image })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row ?? null;
}

/** A player's name (one query per call). */
export async function playerName(db: TenantDb, userId: string) {
	const [row] = await db
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row?.name ?? null;
}

/**
 * Whether the user takes part in the ranking: no preference row, or one
 * whose value is not `false` (compared as stored).
 */
export async function isEloEnabled(
	db: TenantDb,
	userId: string,
): Promise<boolean> {
	const row = await db
		.select({ value: userPreferences.value })
		.from(userPreferences)
		.where(
			and(
				eq(userPreferences.userId, userId),
				eq(userPreferences.key, ELO_PREFERENCE_KEY),
			),
		)
		.limit(1);
	// default = enabled (no pref row)
	return row.length === 0 ? true : row[0]?.value !== FALSE_JSON;
}

/** Not opted out of the ranking: no preference row or not `false`. */
const takesPart: SQL | undefined = or(
	isNull(userPreferences.value),
	ne(userPreferences.value, FALSE_JSON),
);

function withEloPreference(db: TenantDb) {
	return db
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
				eq(userPreferences.key, ELO_PREFERENCE_KEY),
			),
		);
}

/** Members who take part in the ranking. */
export async function rankedMembers(db: TenantDb) {
	return withEloPreference(db).where(takesPart);
}

export type User = {
	id: string;
	name: string | null;
	email: string | null;
	image: string | null;
};

/** Every member, by name and email. */
export async function allUsers(db: TenantDb): Promise<User[]> {
	return db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			image: users.image,
		})
		.from(users)
		.orderBy(users.name, users.email);
}

/** Members other than `userId` who take part in the ranking, by name. */
export async function challengeableMembers(
	db: TenantDb,
	userId: string,
): Promise<User[]> {
	return db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			image: users.image,
		})
		.from(users)
		.leftJoin(
			userPreferences,
			and(
				eq(userPreferences.userId, users.id),
				eq(userPreferences.key, ELO_PREFERENCE_KEY),
			),
		)
		.where(and(ne(users.id, userId), takesPart))
		.orderBy(users.name, users.email);
}

// ─── The profile's ELO card ──────────────────────────────────────────────────

function ownGames(userId: string) {
	return or(eq(games.player1Id, userId), eq(games.player2Id, userId));
}

/** Count, wins, losses and last game of the user's games in this Corps. */
export async function gameTotals(db: TenantDb, userId: string) {
	const [row] = await db
		.select({
			totalGames: sql<number>`count(*)`,
			wins: sql<number>`sum(case when ${games.winnerId} = ${userId} then 1 else 0 end)`,
			losses: sql<number>`sum(case when ${games.winnerId} != ${userId} then 1 else 0 end)`,
			lastGameAt: sql<Date>`max(${games.playedAt})`,
		})
		.from(games)
		.where(ownGames(userId));
	return row;
}

const eloColumns = {
	player1Id: games.player1Id,
	player1EloAfter: games.player1EloAfter,
	player2EloAfter: games.player2EloAfter,
};

/** The ELO after the user's latest game in this Corps, null if none. */
export async function latestGameElo(db: TenantDb, userId: string) {
	const [row] = await db
		.select(eloColumns)
		.from(games)
		.where(ownGames(userId))
		.orderBy(desc(games.playedAt))
		.limit(1);
	return row ?? null;
}

/** The ELO after each of the user's games in this Corps. */
export async function allGameElos(db: TenantDb, userId: string) {
	return db.select(eloColumns).from(games).where(ownGames(userId));
}

/** The user's latest 50 games in this Corps with the ELO after each. */
export async function eloHistoryRows(db: TenantDb, userId: string) {
	return db
		.select({
			playedAt: games.playedAt,
			player1Id: games.player1Id,
			player2Id: games.player2Id,
			player1EloAfter: games.player1EloAfter,
			player2EloAfter: games.player2EloAfter,
		})
		.from(games)
		.where(ownGames(userId))
		.orderBy(desc(games.playedAt))
		.limit(50);
}
