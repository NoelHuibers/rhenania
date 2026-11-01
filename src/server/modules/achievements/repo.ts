// repo.ts — achievements in the tenant DB, cross-Corps games in the control
// DB (#33).
//
// The catalogue with a user's unlocks and progress, the statistics the
// rules read, the progress and unlock writes, the history the
// recalculation reads, and the profile's lists. Every function takes the
// database (or, where cross-Corps games count, the scope) it runs on; none
// checks the caller or applies a rule.
//
// One tracked event costs at most three round trips, however many
// achievements are pending and however long the user's history is:
//   1. the catalogue for this event, with the user's unlocks and progress;
//   2. every statistic the pending rules need, as one batch (plus one batch
//      on the control DB for cross-Corps games, in parallel);
//   3. changed progress and new unlocks, as one batch.

import "server-only";

import {
	and,
	desc,
	eq,
	gte,
	inArray,
	like,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { controlDb } from "~/server/db/control";
import { crossTenantGames } from "~/server/db/control-schema";
import {
	achievementProgress,
	achievements,
	drinks,
	games,
	orders,
	userAchievements,
	users,
} from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";
import {
	DAY_MS,
	HOUR_MS,
	mergeGames,
	type OrderHour,
	type OrderTotals,
	type PlayedGame,
	type RuleInput,
	type StatKey,
	Stats,
	type StatValues,
	toOrderHours,
} from "~/server/domain/achievements/rules";
import type { TenantScope } from "~/server/lib/tenant-scope";

// ── Statistic queries ──────────────────────────────────────────────────────

function ownGamesOf(userId: string): SQL | undefined {
	return or(eq(games.player1Id, userId), eq(games.player2Id, userId));
}

/** Cross-Corps games (control DB) the user played for this scope's Corps. */
function crossGamesOf(tenant: TenantScope, userId: string): SQL | undefined {
	const t = crossTenantGames;
	return or(
		and(eq(t.player1Id, userId), eq(t.player1TenantId, tenant.tenantId)),
		and(eq(t.player2Id, userId), eq(t.player2TenantId, tenant.tenantId)),
	);
}

/** The user's own and cross-Corps games, newest first, optionally since / limited. */
function playedGamesQueries(
	tenant: TenantScope,
	userId: string,
	opts: { since?: Date; limit?: number } = {},
) {
	const own = tenant.db
		.select({ winnerId: games.winnerId, playedAt: games.playedAt })
		.from(games)
		.where(
			opts.since
				? and(ownGamesOf(userId), gte(games.playedAt, opts.since))
				: ownGamesOf(userId),
		)
		.orderBy(desc(games.playedAt))
		.$dynamic();
	const cross = controlDb
		.select({
			winnerId: crossTenantGames.winnerId,
			playedAt: crossTenantGames.playedAt,
		})
		.from(crossTenantGames)
		.where(
			opts.since
				? and(
						crossGamesOf(tenant, userId),
						gte(crossTenantGames.playedAt, opts.since),
					)
				: crossGamesOf(tenant, userId),
		)
		.orderBy(desc(crossTenantGames.playedAt))
		.$dynamic();
	return opts.limit === undefined
		? { own, cross }
		: { own: own.limit(opts.limit), cross: cross.limit(opts.limit) };
}

const rowCount = sql<number>`count(*)`;

/** SUM(amount) over the orders matching `cond`. */
function amountWhere(cond: SQL | undefined) {
	return sql<number>`coalesce(sum(case when ${cond} then ${orders.amount} else 0 end), 0)`;
}

type StatRead<K extends StatKey> = {
	tenant: BatchItem<"sqlite">;
	control?: BatchItem<"sqlite">;
	parse: (tenantRows: unknown, controlRows: unknown) => StatValues[K];
};

type ReadArgs = { tenant: TenantScope; userId: string; input: RuleInput };

/** COUNT(*) always returns exactly one row. */
const countOf = (rows: unknown) => (rows as [{ count: number }])[0].count;

/** One query per statistic (game statistics: one per DB). */
const READS: { [K in StatKey]: (args: ReadArgs) => StatRead<K> } = {
	orderTotals: ({ tenant, userId, input }) => ({
		tenant: tenant.db
			.select({
				totalBeers: sql<number>`coalesce(sum(${orders.amount}), 0)`,
				distinctDrinks: sql<number>`count(distinct ${orders.drinkId})`,
				radler: amountWhere(like(orders.drinkName, "%Radler%")),
				cbesuch: amountWhere(like(orders.bookingFor, "%CBesuch%")),
				hell: amountWhere(
					or(
						like(orders.drinkName, "%Hell%"),
						like(orders.drinkName, "%Helles%"),
					),
				),
				pils: amountWhere(like(orders.drinkName, "%Pils%")),
				totalSpent: sql<number>`coalesce(sum(${orders.total}), 0)`,
				ordersLastHour: sql<number>`coalesce(sum(case when ${gte(
					orders.createdAt,
					new Date(input.now.getTime() - HOUR_MS),
				)} then 1 else 0 end), 0)`,
			})
			.from(orders)
			.where(eq(orders.userId, userId)),
		// An aggregate without GROUP BY always returns exactly one row.
		parse: (rows) => (rows as [OrderTotals])[0],
	}),

	crateSize: ({ tenant, input }) => ({
		tenant: tenant.db
			.select({ kastengroesse: drinks.kastengroesse })
			.from(drinks)
			.where(eq(drinks.id, input.context?.drinkId ?? ""))
			.limit(1),
		parse: (rows) =>
			(rows as Array<{ kastengroesse: number | null }>)[0]?.kastengroesse ??
			null,
	}),

	recentOrders: ({ tenant, userId, input }) => ({
		tenant: tenant.db
			.select({ amount: orders.amount, createdAt: orders.createdAt })
			.from(orders)
			.where(
				and(
					eq(orders.userId, userId),
					// A Berlin day is at most 25 h long.
					gte(orders.createdAt, new Date(input.now.getTime() - 25 * HOUR_MS)),
				),
			),
		parse: (rows) =>
			toOrderHours(rows as Array<{ amount: number; createdAt: Date }>),
	}),

	latestOrderTimes: ({ tenant, userId }) => ({
		tenant: tenant.db
			.select({ createdAt: orders.createdAt })
			.from(orders)
			.where(eq(orders.userId, userId))
			.orderBy(desc(orders.createdAt))
			.limit(200),
		parse: (rows) =>
			(rows as Array<{ createdAt: Date }>).map((r) => r.createdAt),
	}),

	orderHourBuckets: ({ tenant, userId }) => ({
		// Berlin is a whole number of hours off UTC, so every UTC hour lies
		// within one Berlin day: bucket by hour in SQL, map to days in JS.
		tenant: tenant.db
			.selectDistinct({ hour: sql<number>`${orders.createdAt} / 3600` })
			.from(orders)
			.where(eq(orders.userId, userId)),
		parse: (rows) => (rows as Array<{ hour: number }>).map((r) => r.hour),
	}),

	accountCreatedAt: ({ tenant, userId }) => ({
		tenant: tenant.db
			.select({ createdAt: users.createdAt })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1),
		parse: (rows) =>
			(rows as Array<{ createdAt: Date | null }>)[0]?.createdAt ?? null,
	}),

	totalGames: ({ tenant, userId }) => ({
		tenant: tenant.db
			.select({ count: rowCount })
			.from(games)
			.where(ownGamesOf(userId)),
		control: controlDb
			.select({ count: rowCount })
			.from(crossTenantGames)
			.where(crossGamesOf(tenant, userId)),
		parse: (own, cross) => countOf(own) + countOf(cross),
	}),

	totalWins: ({ tenant, userId }) => ({
		tenant: tenant.db
			.select({ count: rowCount })
			.from(games)
			.where(eq(games.winnerId, userId)),
		control: controlDb
			.select({ count: rowCount })
			.from(crossTenantGames)
			.where(
				and(
					eq(crossTenantGames.winnerId, userId),
					crossGamesOf(tenant, userId),
				),
			),
		parse: (own, cross) => countOf(own) + countOf(cross),
	}),

	latestGames: ({ tenant, userId }) => {
		const q = playedGamesQueries(tenant, userId, { limit: 20 });
		return {
			tenant: q.own,
			control: q.cross,
			parse: (own, cross) =>
				mergeGames(own as PlayedGame[], cross as PlayedGame[], 20),
		};
	},

	gamesLastWeek: ({ tenant, userId, input }) => {
		const since = new Date(input.now.getTime() - 7 * DAY_MS);
		const q = playedGamesQueries(tenant, userId, { since });
		return {
			tenant: q.own,
			control: q.cross,
			parse: (own, cross) =>
				mergeGames(own as PlayedGame[], cross as PlayedGame[]),
		};
	},
};

type Batchable = {
	batch: (
		items: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
	) => Promise<unknown[]>;
};

/** Sends the queries in one round trip (none if there are none). */
async function runBatch(
	target: unknown,
	items: BatchItem<"sqlite">[],
): Promise<unknown[]> {
	const [first, ...rest] = items;
	if (!first) {
		return [];
	}
	return (target as Batchable).batch([first, ...rest]);
}

/** Loads the statistics: one tenant batch and one control batch, in parallel. */
export async function loadStats(
	tenant: TenantScope,
	userId: string,
	keys: Iterable<StatKey>,
	input: RuleInput,
): Promise<Stats> {
	const reads = [...new Set(keys)].map((key) => ({
		key,
		read: (READS[key] as (args: ReadArgs) => StatRead<StatKey>)({
			tenant,
			userId,
			input,
		}),
	}));
	const [tenantResults, controlResults] = await Promise.all([
		runBatch(
			tenant.db,
			reads.map(({ read }) => read.tenant),
		),
		runBatch(
			controlDb,
			reads.flatMap(({ read }) => (read.control ? [read.control] : [])),
		),
	]);

	const values: Partial<Record<StatKey, unknown>> = {};
	let c = 0;
	reads.forEach(({ key, read }, i) => {
		const controlRows = read.control ? controlResults[c++] : undefined;
		values[key] = read.parse(tenantResults[i], controlRows);
	});
	return new Stats(values as Partial<StatValues>);
}

// ── Catalogue, progress and unlocks ────────────────────────────────────────

export type CatalogueEntry = {
	id: string;
	key: string;
	targetValue: number | null;
	unlocked: boolean;
	/** Stored progress, null if none yet. */
	progress: number | null;
};

/** Active achievements (optionally only some keys) with the user's state. */
export async function loadCatalogue(
	db: TenantDb,
	userId: string,
	keys?: string[],
): Promise<CatalogueEntry[]> {
	const rows = await db
		.select({
			id: achievements.id,
			key: achievements.key,
			targetValue: achievements.targetValue,
			unlockedId: userAchievements.id,
			progress: achievementProgress.currentValue,
		})
		.from(achievements)
		.leftJoin(
			userAchievements,
			and(
				eq(userAchievements.achievementId, achievements.id),
				eq(userAchievements.userId, userId),
			),
		)
		.leftJoin(
			achievementProgress,
			and(
				eq(achievementProgress.achievementId, achievements.id),
				eq(achievementProgress.userId, userId),
			),
		)
		.where(
			keys
				? and(eq(achievements.isActive, true), inArray(achievements.key, keys))
				: eq(achievements.isActive, true),
		);
	return rows.map((r) => ({
		id: r.id,
		key: r.key,
		targetValue: r.targetValue,
		unlocked: r.unlockedId !== null,
		progress: r.progress,
	}));
}

export type Outcome = { achievement: CatalogueEntry; value: number };

/**
 * Writes new progress values (only those that changed) and unlocks every
 * not yet unlocked achievement whose value reached its target, in one batch.
 */
export async function saveOutcomes(
	db: TenantDb,
	userId: string,
	outcomes: Outcome[],
	now: Date,
): Promise<void> {
	const writes: BatchItem<"sqlite">[] = [];
	for (const { achievement, value } of outcomes) {
		if (value !== achievement.progress) {
			writes.push(
				db
					.insert(achievementProgress)
					.values({
						userId,
						achievementId: achievement.id,
						currentValue: value,
						lastUpdated: now,
					})
					.onConflictDoUpdate({
						target: [
							achievementProgress.userId,
							achievementProgress.achievementId,
						],
						set: { currentValue: value, lastUpdated: now },
					}),
			);
		}
		if (
			!achievement.unlocked &&
			achievement.targetValue !== null &&
			value >= achievement.targetValue
		) {
			writes.push(
				db
					.insert(userAchievements)
					.values({ userId, achievementId: achievement.id, unlockedAt: now })
					.onConflictDoNothing(),
			);
		}
	}
	await runBatch(db, writes);
}

// ── History (the recalculation) ────────────────────────────────────────────

/** The Berlin hour of each of the user's orders, keyed by Berlin day. */
export async function orderHours(
	db: TenantDb,
	userId: string,
): Promise<OrderHour[]> {
	const rows = await db
		.select({ amount: orders.amount, createdAt: orders.createdAt })
		.from(orders)
		.where(eq(orders.userId, userId));
	return toOrderHours(rows);
}

/** All of the user's games, own and cross-Corps, newest first. */
export async function playedGames(
	tenant: TenantScope,
	userId: string,
): Promise<PlayedGame[]> {
	const q = playedGamesQueries(tenant, userId);
	const [own, cross] = await Promise.all([q.own, q.cross]);
	return mergeGames(own, cross);
}

/** How many of the user's orders were a Sekt. */
export async function sektOrderCount(
	db: TenantDb,
	userId: string,
): Promise<number> {
	const result = await db
		.select({ count: sql<number>`count(*)` })
		.from(orders)
		.where(and(eq(orders.userId, userId), like(orders.drinkName, "%Sekt%")));
	return result[0]?.count ?? 0;
}

/** Amount and crate size of the user's orders, optionally of some drinks. */
export async function crateOrders(
	db: TenantDb,
	userId: string,
	nameFilter?: string,
): Promise<Array<{ amount: number; kastengroesse: number | null }>> {
	const conditions = nameFilter
		? and(eq(orders.userId, userId), like(orders.drinkName, `%${nameFilter}%`))
		: eq(orders.userId, userId);

	return db
		.select({ amount: orders.amount, kastengroesse: drinks.kastengroesse })
		.from(orders)
		.leftJoin(drinks, eq(drinks.id, orders.drinkId))
		.where(conditions);
}

/** The user's profile picture, null if none (or no such user). */
export async function userImage(
	db: TenantDb,
	userId: string,
): Promise<string | null> {
	const user = await db
		.select({ image: users.image })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return user[0]?.image ?? null;
}

// ── The profile's lists ────────────────────────────────────────────────────

export type Achievement = typeof achievements.$inferSelect;

/** Every active achievement. */
export async function activeAchievements(db: TenantDb): Promise<Achievement[]> {
	return db.select().from(achievements).where(eq(achievements.isActive, true));
}

/** The user's unlocks. */
export async function unlocksOf(db: TenantDb, userId: string) {
	return db
		.select()
		.from(userAchievements)
		.where(eq(userAchievements.userId, userId));
}

/** The user's stored progress. */
export async function progressOf(db: TenantDb, userId: string) {
	return db
		.select()
		.from(achievementProgress)
		.where(eq(achievementProgress.userId, userId));
}

/** Unlocks per achievement, and how many users unlocked anything. */
export async function unlockCounts(db: TenantDb) {
	const [counts, totals] = await Promise.all([
		db
			.select({
				achievementId: userAchievements.achievementId,
				cnt: sql<number>`count(*)`,
			})
			.from(userAchievements)
			.groupBy(userAchievements.achievementId),
		db
			.select({
				total: sql<number>`count(distinct ${userAchievements.userId})`,
			})
			.from(userAchievements),
	]);
	return { counts, unlockingUsers: totals[0]?.total ?? 0 };
}
