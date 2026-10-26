// Factories for the gamification domain: ELO stats, games, challenges,
// orders with explicit timestamps, achievement definitions and a frozen
// clock.
//
//   freezeClock("2026-10-26T18:00:00Z");
//   const [a, b] = await createPlayers(2);
//   await setUserStats(a.id, { currentElo: 1400 });
//   const { gameId } = await playChallenge({ challenger: a, opponent: b, drink, winner: a });

import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, vi } from "vitest";

import { defaultAchievements } from "~/lib/achievements/version1";
import {
	confirmResult,
	createChallenge,
	type PaymentRule,
	proposeResult,
	respondToChallenge,
} from "~/server/actions/game/challenge";
import { userStats } from "~/server/db/control-schema";
import {
	achievementProgress,
	achievements,
	drinks,
	games,
	orders,
	userAchievements,
	userPreferences,
} from "~/server/db/schema";
import {
	controlDb,
	createUser,
	signInAs,
	type TestUser,
	tenantDb,
} from "../harness";
import { testState } from "../state";

const ELO_PREF_KEY = "gamification.eloEnabled";

// ─── Clock ──────────────────────────────────────────────────────────────────

/** Freezes `Date` (only) at the given instant. Timers keep running. */
export function freezeClock(at: string | Date) {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date(at));
}

export function advanceClock(ms: number) {
	vi.setSystemTime(new Date(Date.now() + ms));
}

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Runs every test of the enclosing suite with the given server time zone
 * (e.g. "UTC" like the production servers), independent of the TZ the test
 * run was started with.
 */
export function useServerTimeZone(tz: string) {
	let previous: string | undefined;
	beforeEach(() => {
		previous = process.env.TZ;
		process.env.TZ = tz;
	});
	afterEach(() => {
		process.env.TZ = previous;
	});
}

// ─── Players & ELO ──────────────────────────────────────────────────────────

type Players<
	N extends number,
	R extends TestUser[] = [],
> = R["length"] extends N ? R : Players<N, [...R, TestUser]>;

/** Creates `count` members of the request's tenant (typed as a tuple). */
export async function createPlayers<N extends 1 | 2 | 3 | 4 | 5>(
	count: N,
	opts: { tenantId?: string } = {},
): Promise<Players<N>> {
	const players: TestUser[] = [];
	for (let i = 0; i < count; i++) {
		players.push(await createUser({ tenantId: opts.tenantId }));
	}
	return players as Players<N>;
}

/** Stores the ELO opt-in/opt-out preference the way the profile page does. */
export async function setEloEnabled(
	userId: string,
	enabled: boolean,
	tenantId = testState.tenantId ?? undefined,
) {
	const value = JSON.stringify(enabled);
	await tenantDb(tenantId)
		.insert(userPreferences)
		.values({ userId, key: ELO_PREF_KEY, value, valueType: "boolean" })
		.onConflictDoUpdate({
			target: [userPreferences.userId, userPreferences.key],
			set: { value },
		});
}

export type StatsInput = Partial<Omit<typeof userStats.$inferInsert, "userId">>;

/** Upserts the unified (control DB) ELO row of a user. */
export async function setUserStats(userId: string, values: StatsInput) {
	const row = {
		currentElo: 1200,
		peakElo: values.currentElo ?? 1200,
		totalGames: 0,
		wins: 0,
		losses: 0,
		...values,
	};
	await controlDb()
		.insert(userStats)
		.values({ userId, ...row })
		.onConflictDoUpdate({ target: userStats.userId, set: row });
}

export async function getUserStatsRow(userId: string) {
	const [row] = await controlDb()
		.select()
		.from(userStats)
		.where(eq(userStats.userId, userId));
	return row;
}

export async function insertGame(
	opts: {
		player1Id: string;
		player2Id: string;
		winnerId: string;
		playedAt?: Date;
		player1EloBefore?: number;
		player2EloBefore?: number;
		player1EloAfter?: number;
		player2EloAfter?: number;
	},
	tenantId = testState.tenantId ?? undefined,
) {
	const [game] = await tenantDb(tenantId)
		.insert(games)
		.values({ playedAt: new Date(), ...opts })
		.returning();
	if (!game) {
		throw new Error("Could not create game");
	}
	return game;
}

// ─── Drinks & orders ────────────────────────────────────────────────────────

export async function createDrinkWith(
	opts: {
		name: string;
		price?: number;
		kastengroesse?: number | null;
		volume?: number | null;
		available?: boolean;
	},
	tenantId = testState.tenantId ?? undefined,
) {
	const [drink] = await tenantDb(tenantId)
		.insert(drinks)
		.values({
			name: opts.name,
			price: opts.price ?? 1.5,
			kastengroesse: opts.kastengroesse ?? null,
			volume: opts.volume ?? null,
			isCurrentlyAvailable: opts.available ?? true,
		})
		.returning();
	if (!drink) {
		throw new Error("Could not create drink");
	}
	return drink;
}

/**
 * Inserts an order row directly. `createdAt` defaults to the (possibly
 * frozen) JS clock; the column's SQL default would use the real clock.
 */
export async function insertOrder(
	opts: {
		user: TestUser;
		drink: { id: string; name: string; price: number };
		amount?: number;
		createdAt?: Date;
		bookingFor?: string | null;
	},
	tenantId = testState.tenantId ?? undefined,
) {
	const amount = opts.amount ?? 1;
	const [order] = await tenantDb(tenantId)
		.insert(orders)
		.values({
			userId: opts.user.id,
			userName: opts.user.name ?? "",
			drinkId: opts.drink.id,
			drinkName: opts.drink.name,
			amount,
			pricePerUnit: opts.drink.price,
			total: opts.drink.price * amount,
			bookingFor: opts.bookingFor ?? null,
			createdAt: opts.createdAt ?? new Date(),
		})
		.returning();
	if (!order) {
		throw new Error("Could not create order");
	}
	return order;
}

// ─── Achievements ───────────────────────────────────────────────────────────

/** Inserts the version-1 achievement catalogue into a tenant DB. */
export async function seedAchievementDefinitions(
	tenantId = testState.tenantId ?? undefined,
) {
	await tenantDb(tenantId).insert(achievements).values(defaultAchievements);
}

export async function unlockedKeys(
	userId: string,
	tenantId = testState.tenantId ?? undefined,
): Promise<string[]> {
	const rows = await tenantDb(tenantId)
		.select({ key: achievements.key })
		.from(userAchievements)
		.innerJoin(
			achievements,
			eq(userAchievements.achievementId, achievements.id),
		)
		.where(eq(userAchievements.userId, userId));
	return rows.map((r) => r.key).sort();
}

export async function progressOf(
	userId: string,
	key: string,
	tenantId = testState.tenantId ?? undefined,
): Promise<number | undefined> {
	const [row] = await tenantDb(tenantId)
		.select({ value: achievementProgress.currentValue })
		.from(achievementProgress)
		.innerJoin(
			achievements,
			eq(achievementProgress.achievementId, achievements.id),
		)
		.where(
			and(eq(achievementProgress.userId, userId), eq(achievements.key, key)),
		);
	return row?.value;
}

// ─── Challenges ─────────────────────────────────────────────────────────────

/**
 * Drives an intra-Corps challenge through the real server actions up to the
 * proposed result (or the end, with `confirm: true`). Leaves the opponent
 * signed in.
 */
export async function playChallenge(opts: {
	challenger: TestUser;
	opponent: TestUser;
	drink: { id: string };
	winner: TestUser;
	payment?: PaymentRule;
	proposedBy?: TestUser;
	confirm?: boolean;
}) {
	signInAs(opts.challenger);
	const created = await createChallenge({
		opponentId: opts.opponent.id,
		drinkId: opts.drink.id,
		payment: opts.payment ?? "loser",
	});
	if (!created.success || !created.challengeId) {
		throw new Error(`createChallenge failed: ${created.error}`);
	}
	const challengeId = created.challengeId;

	signInAs(opts.opponent);
	const accepted = await respondToChallenge({
		challengeId,
		response: "accept",
	});
	if (!accepted.success) {
		throw new Error(`accept failed: ${accepted.error}`);
	}

	const proposer = opts.proposedBy ?? opts.challenger;
	signInAs(proposer);
	const proposed = await proposeResult({
		challengeId,
		winnerId: opts.winner.id,
	});
	if (!proposed.success) {
		throw new Error(`propose failed: ${proposed.error}`);
	}

	const confirmer =
		proposer.id === opts.challenger.id ? opts.opponent : opts.challenger;
	signInAs(confirmer);
	if (!opts.confirm) {
		return { challengeId, gameId: undefined };
	}

	const confirmed = await confirmResult(challengeId);
	if (!confirmed.success) {
		throw new Error(`confirm failed: ${confirmed.error}`);
	}
	return { challengeId, gameId: confirmed.gameId };
}
