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
import { dayKeyInTZ, getZonedParts } from "~/lib/time";
import { db } from "~/server/db";
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
import { getTenantDb, type TenantDb } from "~/server/db/tenants";
import { getTenantId } from "~/server/lib/tenant-context";

export type AchievementEvent =
	| "order_created"
	| "game_won"
	| "game_lost"
	| "game_played"
	| "profile_picture_set"
	| "account_created";

export interface OrderEventContext {
	drinkName: string;
	drinkId: string;
	amount: number;
	total: number;
	bookingFor?: string | null;
}

export interface TrackingOptions {
	/**
	 * Corps whose achievements to evaluate. Defaults to the Corps of the
	 * current request; pass it explicitly when acting for a player of another
	 * Corps (cross-Corps games) or after the response (`after()`).
	 */
	tenantId?: string;
}

/** Where to read and write: one Corps' DB, plus its id for cross-Corps games. */
type Scope = { db: TenantDb; tenantId: string | null };

async function resolveScope(options: TrackingOptions): Promise<Scope> {
	if (options.tenantId) {
		return {
			db: await getTenantDb(options.tenantId),
			tenantId: options.tenantId,
		};
	}
	let tenantId: string | null = null;
	try {
		tenantId = await getTenantId();
	} catch {
		// Outside a request (seed script): default DB, all cross-Corps games.
	}
	return { db, tenantId };
}

// ── How tracking talks to the database ─────────────────────────────────────
//
// One event costs at most three round trips, however many achievements are
// pending and however long the user's history is:
//   1. the catalogue for this event, with the user's unlocks and progress;
//   2. every statistic the pending rules need, as one batch (plus one batch
//      on the control DB for cross-Corps games, in parallel);
//   3. changed progress and new unlocks, as one batch.
// The rules (RULES below) are pure functions of that snapshot.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type ZonedParts = ReturnType<typeof getZonedParts>;
type PlayedGame = { winnerId: string; playedAt: Date };
type OrderHour = { day: string; hour: number; amount: number };

type OrderTotals = {
	totalBeers: number;
	distinctDrinks: number;
	radler: number;
	/** Beers booked for a CBesuch (bookingFor contains "CBesuch"). */
	cbesuch: number;
	hell: number;
	pils: number;
	totalSpent: number;
	/** Order rows of the last 60 minutes. */
	ordersLastHour: number;
};

/** Everything a rule may read, loaded once per event. */
type StatValues = {
	orderTotals: OrderTotals;
	/** Crate size of the ordered drink (null: none, or drink not found). */
	crateSize: number | null;
	/** The user's orders of the last 25 h, which always cover today in Berlin. */
	recentOrders: OrderHour[];
	/** Creation times of the user's latest 200 orders, newest first. */
	latestOrderTimes: Date[];
	/** Distinct UTC hours (hours since the epoch) with at least one order. */
	orderHourBuckets: number[];
	accountCreatedAt: Date | null;
	totalGames: number;
	totalWins: number;
	/** The latest 20 games, own and cross-Corps, newest first. */
	latestGames: PlayedGame[];
	/** Own and cross-Corps games of the last 7 days. */
	gamesLastWeek: PlayedGame[];
};
type StatKey = keyof StatValues;

class Stats {
	constructor(private readonly values: Partial<StatValues>) {}

	get<K extends StatKey>(key: K): StatValues[K] {
		if (!(key in this.values)) {
			throw new Error(`Achievement statistic not loaded: ${key}`);
		}
		return this.values[key] as StatValues[K];
	}
}

type RuleInput = {
	userId: string;
	context?: OrderEventContext;
	now: Date;
	/** `now` on the Berlin wall clock. */
	zoned: ZonedParts;
};

type Rule = {
	/** The rule only applies (and loads nothing) when this holds. */
	when?: (input: RuleInput) => boolean;
	needs?: StatKey[];
	/** New progress value, or null to leave the achievement untouched. */
	value: (stats: Stats, input: RuleInput) => number | null;
};

// ── Statistic queries ──────────────────────────────────────────────────────

function ownGamesOf(userId: string): SQL | undefined {
	return or(eq(games.player1Id, userId), eq(games.player2Id, userId));
}

/** Cross-Corps games (control DB) the user played for this scope's Corps. */
function crossGamesOf(scope: Scope, userId: string): SQL | undefined {
	const t = crossTenantGames;
	if (!scope.tenantId) {
		return or(eq(t.player1Id, userId), eq(t.player2Id, userId));
	}
	return or(
		and(eq(t.player1Id, userId), eq(t.player1TenantId, scope.tenantId)),
		and(eq(t.player2Id, userId), eq(t.player2TenantId, scope.tenantId)),
	);
}

/** The user's own and cross-Corps games, newest first, optionally since / limited. */
function playedGamesQueries(
	scope: Scope,
	userId: string,
	opts: { since?: Date; limit?: number } = {},
) {
	const own = scope.db
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
						crossGamesOf(scope, userId),
						gte(crossTenantGames.playedAt, opts.since),
					)
				: crossGamesOf(scope, userId),
		)
		.orderBy(desc(crossTenantGames.playedAt))
		.$dynamic();
	return opts.limit === undefined
		? { own, cross }
		: { own: own.limit(opts.limit), cross: cross.limit(opts.limit) };
}

/** Own and cross-Corps games merged, newest first. */
function mergeGames(
	own: PlayedGame[],
	cross: PlayedGame[],
	limit?: number,
): PlayedGame[] {
	const all = [...own, ...cross].sort(
		(a, b) => b.playedAt.getTime() - a.playedAt.getTime(),
	);
	return limit === undefined ? all : all.slice(0, limit);
}

function toOrderHours(
	rows: Array<{ amount: number; createdAt: Date }>,
): OrderHour[] {
	return rows.map((r) => ({
		day: dayKeyInTZ(r.createdAt),
		hour: getZonedParts(r.createdAt).hour,
		amount: r.amount,
	}));
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

type ReadArgs = { scope: Scope; userId: string; input: RuleInput };

/** COUNT(*) always returns exactly one row. */
const countOf = (rows: unknown) => (rows as [{ count: number }])[0].count;

/** One query per statistic (game statistics: one per DB). */
const READS: { [K in StatKey]: (args: ReadArgs) => StatRead<K> } = {
	orderTotals: ({ scope, userId, input }) => ({
		tenant: scope.db
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

	crateSize: ({ scope, input }) => ({
		tenant: scope.db
			.select({ kastengroesse: drinks.kastengroesse })
			.from(drinks)
			.where(eq(drinks.id, input.context?.drinkId ?? ""))
			.limit(1),
		parse: (rows) =>
			(rows as Array<{ kastengroesse: number | null }>)[0]?.kastengroesse ??
			null,
	}),

	recentOrders: ({ scope, userId, input }) => ({
		tenant: scope.db
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

	latestOrderTimes: ({ scope, userId }) => ({
		tenant: scope.db
			.select({ createdAt: orders.createdAt })
			.from(orders)
			.where(eq(orders.userId, userId))
			.orderBy(desc(orders.createdAt))
			.limit(200),
		parse: (rows) =>
			(rows as Array<{ createdAt: Date }>).map((r) => r.createdAt),
	}),

	orderHourBuckets: ({ scope, userId }) => ({
		// Berlin is a whole number of hours off UTC, so every UTC hour lies
		// within one Berlin day: bucket by hour in SQL, map to days in JS.
		tenant: scope.db
			.selectDistinct({ hour: sql<number>`${orders.createdAt} / 3600` })
			.from(orders)
			.where(eq(orders.userId, userId)),
		parse: (rows) => (rows as Array<{ hour: number }>).map((r) => r.hour),
	}),

	accountCreatedAt: ({ scope, userId }) => ({
		tenant: scope.db
			.select({ createdAt: users.createdAt })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1),
		parse: (rows) =>
			(rows as Array<{ createdAt: Date | null }>)[0]?.createdAt ?? null,
	}),

	totalGames: ({ scope, userId }) => ({
		tenant: scope.db
			.select({ count: rowCount })
			.from(games)
			.where(ownGamesOf(userId)),
		control: controlDb
			.select({ count: rowCount })
			.from(crossTenantGames)
			.where(crossGamesOf(scope, userId)),
		parse: (own, cross) => countOf(own) + countOf(cross),
	}),

	totalWins: ({ scope, userId }) => ({
		tenant: scope.db
			.select({ count: rowCount })
			.from(games)
			.where(eq(games.winnerId, userId)),
		control: controlDb
			.select({ count: rowCount })
			.from(crossTenantGames)
			.where(
				and(eq(crossTenantGames.winnerId, userId), crossGamesOf(scope, userId)),
			),
		parse: (own, cross) => countOf(own) + countOf(cross),
	}),

	latestGames: ({ scope, userId }) => {
		const q = playedGamesQueries(scope, userId, { limit: 20 });
		return {
			tenant: q.own,
			control: q.cross,
			parse: (own, cross) =>
				mergeGames(own as PlayedGame[], cross as PlayedGame[], 20),
		};
	},

	gamesLastWeek: ({ scope, userId, input }) => {
		const since = new Date(input.now.getTime() - 7 * DAY_MS);
		const q = playedGamesQueries(scope, userId, { since });
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
async function loadStats(
	scope: Scope,
	userId: string,
	keys: Iterable<StatKey>,
	input: RuleInput,
): Promise<Stats> {
	const reads = [...new Set(keys)].map((key) => ({
		key,
		read: (READS[key] as (args: ReadArgs) => StatRead<StatKey>)({
			scope,
			userId,
			input,
		}),
	}));
	const [tenantResults, controlResults] = await Promise.all([
		runBatch(
			scope.db,
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

// ── Pure helpers on the snapshot ───────────────────────────────────────────

/** Beers ordered today (Berlin day), optionally only in some Berlin hours. */
function beersToday(
	recent: OrderHour[],
	now: Date,
	hourFilter: (hour: number) => boolean = () => true,
): number {
	const today = dayKeyInTZ(now);
	let total = 0;
	for (const r of recent) {
		if (r.day === today && hourFilter(r.hour)) {
			total += r.amount;
		}
	}
	return total;
}

/** Distinct Berlin calendar days among the given epoch hours. */
function distinctOrderDays(hourBuckets: number[]): number {
	const days = new Set<string>();
	for (const hour of hourBuckets) {
		days.add(dayKeyInTZ(new Date(hour * HOUR_MS)));
	}
	return days.size;
}

/** Consecutive wins, counted from the most recent game. */
function currentStreak(latest: PlayedGame[], userId: string): number {
	let streak = 0;
	for (const game of latest) {
		if (game.winnerId !== userId) {
			break;
		}
		streak++;
	}
	return streak;
}

/** Shifts a `YYYY-MM-DD` calendar date by whole days (no time zone involved). */
function shiftDayKey(day: string, days: number): string {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function daysBetween(later: string, earlier: string): number {
	return Math.round(
		(Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) /
			DAY_MS,
	);
}

/** Consecutive weekends (Sat/Sun, Berlin time) with at least one order. */
function consecutiveWeekends(orderTimes: Date[]): number {
	// Normalize each weekend order to its Saturday's Berlin date
	const weekSaturdays = new Set<string>();
	for (const createdAt of orderTimes) {
		const { weekday } = getZonedParts(createdAt); // 0=Sun, 6=Sat
		if (weekday === 0 || weekday === 6) {
			const day = dayKeyInTZ(createdAt);
			weekSaturdays.add(weekday === 6 ? day : shiftDayKey(day, -1));
		}
	}

	const sorted = Array.from(weekSaturdays).sort().reverse();
	if (sorted.length === 0) {
		return 0;
	}

	let streak = 1;
	for (let i = 1; i < sorted.length; i++) {
		// biome-ignore lint/style/noNonNullAssertion: within loop bounds
		if (daysBetween(sorted[i - 1]!, sorted[i]!) === 7) {
			streak++;
		} else {
			break;
		}
	}
	return streak;
}

/** Account age in full days. */
function accountAgeInDays(createdAt: Date | null, now: Date): number {
	if (!createdAt) {
		return 0;
	}
	return Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS);
}

// ── Rules per event ────────────────────────────────────────────────────────

const totals = (s: Stats) => s.get("orderTotals");

const beerMilestone: Rule = {
	needs: ["orderTotals"],
	value: (s) => totals(s).totalBeers,
};
const cbesuchSeries: Rule = {
	needs: ["orderTotals"],
	value: (s) => totals(s).cbesuch,
};
const spending: Rule = {
	needs: ["orderTotals"],
	value: (s) => totals(s).totalSpent,
};
const gamesPlayed: Rule = {
	needs: ["totalGames"],
	value: (s) => s.get("totalGames"),
};
const gamesWon: Rule = {
	needs: ["totalWins"],
	value: (s) => s.get("totalWins"),
};
const winningStreak: Rule = {
	needs: ["latestGames"],
	value: (s, { userId }) => currentStreak(s.get("latestGames"), userId),
};
const streakBroken: Rule = { value: () => 0 };
const always1: Rule = { value: () => 1 };

const isMorning = (hour: number) => hour >= 5 && hour < 8;
const isMidnight = (hour: number) => hour === 0;
const onDate = (month: number, day: number) => (input: RuleInput) =>
	input.zoned.month === month && input.zoned.day === day;

const RULES: Record<AchievementEvent, Record<string, Rule>> = {
	order_created: {
		// ── Drinking milestones (total beers ordered) ──────────────────────
		spefuchs: beerMilestone,
		fuchs: beerMilestone,
		cb: beerMilestone,
		iacb: beerMilestone,
		ah: beerMilestone,
		aheb: beerMilestone,

		// ── Drink variety ──────────────────────────────────────────────────
		biertasting: {
			needs: ["orderTotals"],
			value: (s) => totals(s).distinctDrinks,
		},

		// ── Special drinks ─────────────────────────────────────────────────
		kaisersflotte: {
			when: ({ context }) => /sekt/i.test(context?.drinkName ?? ""),
			value: () => 1,
		},
		kisteoderliste: {
			when: ({ context }) => context !== undefined,
			needs: ["crateSize"],
			value: (s, { context }) => {
				const kiste = s.get("crateSize");
				return kiste && (context?.amount ?? 0) >= kiste ? 1 : null;
			},
		},
		alkoholfrei: {
			when: ({ context }) => /alkoholfrei/i.test(context?.drinkName ?? ""),
			needs: ["crateSize"],
			value: (s, { context }) =>
				(context?.amount ?? 0) >= (s.get("crateSize") ?? 20) ? 1 : null,
		},
		radler: { needs: ["orderTotals"], value: (s) => totals(s).radler },

		// ── CBesuch drinking ───────────────────────────────────────────────
		cbesuch: cbesuchSeries,
		cbesuch2: cbesuchSeries,
		cbesuch3: cbesuchSeries,
		cbesuch4: cbesuchSeries,

		// ── Oetti Hell / Pils ratio ────────────────────────────────────────
		// targetValue for both is 10, meaning 10 more of one type than the other
		helleseite: {
			needs: ["orderTotals"],
			value: (s) => totals(s).hell - totals(s).pils,
		},
		dunkleseite: {
			needs: ["orderTotals"],
			value: (s) => totals(s).pils - totals(s).hell,
		},
		// targetValue=100, unlocks when total >= 100 AND neither Hell nor Pils
		// dominates by more than the helleseite/dunkleseite threshold (10)
		avatar: {
			needs: ["orderTotals"],
			value: (s) => {
				const t = totals(s);
				return Math.abs(t.hell - t.pils) < 10 ? t.totalBeers : null;
			},
		},

		// ── Financial ─────────────────────────────────────────────────────
		first_tab: always1,
		big_spender: spending,
		whale: spending,

		// ── Time-based (Europe/Berlin wall clock, whatever the server zone) ─
		// targetValue=1: unlocks once after 4 beers between 05:00–08:00
		fruhaufsteher: {
			when: ({ zoned }) => isMorning(zoned.hour),
			needs: ["recentOrders"],
			value: (s, { now }) =>
				beersToday(s.get("recentOrders"), now, isMorning) >= 4 ? 1 : null,
		},
		// targetValue=10: tracks order count in the last hour
		goldenestunde: {
			needs: ["orderTotals"],
			value: (s) => totals(s).ordersLastHour,
		},
		// targetValue=10: consecutive weekends with at least one order
		wocheende: {
			when: ({ zoned }) => zoned.weekday === 0 || zoned.weekday === 6,
			needs: ["latestOrderTimes"],
			value: (s) => consecutiveWeekends(s.get("latestOrderTimes")),
		},
		// targetValue=365: distinct calendar days with at least one order
		dedication: {
			needs: ["orderHourBuckets"],
			value: (s) => distinctOrderDays(s.get("orderHourBuckets")),
		},

		// ── Date-specific drinking ─────────────────────────────────────────
		// targetValue=1: 4+ beers ordered between 00:00–01:00
		berry: {
			when: ({ zoned }) => isMidnight(zoned.hour),
			needs: ["recentOrders"],
			value: (s, { now }) =>
				beersToday(s.get("recentOrders"), now, isMidnight) >= 4 ? 1 : null,
		},
		// targetValue=1: any order on Jan 1 between 00:00–01:00
		neujahr: {
			when: (input) => onDate(1, 1)(input) && isMidnight(input.zoned.hour),
			value: () => 1,
		},
		// targetValue=10: sum of beers ordered on May 1
		erstermai: {
			when: onDate(5, 1),
			needs: ["recentOrders"],
			value: (s, { now }) => beersToday(s.get("recentOrders"), now),
		},
		// targetValue=10: sum of beers ordered on Feb 21
		grundungstag: {
			when: onDate(2, 21),
			needs: ["recentOrders"],
			value: (s, { now }) => beersToday(s.get("recentOrders"), now),
		},

		// targetValue=365: account must be at least one year old
		biergeburtstag: {
			needs: ["accountCreatedAt"],
			value: (s, { now }) => accountAgeInDays(s.get("accountCreatedAt"), now),
		},
	},

	game_played: {
		// targetValue=1: play a game on Oct 3 (German Unity Day)
		deutschland: { when: onDate(10, 3), value: () => 1 },
		tierlunge: gamesPlayed,
		jungerfuchs: gamesPlayed,
		jungaktiver: gamesPlayed,
		// targetValue=7: a game on each of 7 distinct days within the last week
		perfektewoche: {
			needs: ["gamesLastWeek"],
			value: (s) =>
				new Set(s.get("gamesLastWeek").map((g) => dayKeyInTZ(g.playedAt))).size,
		},
	},

	game_won: {
		erstersieg: gamesWon,
		champion: gamesWon,
		winning_streak_3: winningStreak,
		winning_streak_5: winningStreak,
		winning_streak_10: winningStreak,
	},

	game_lost: {
		winning_streak_3: streakBroken,
		winning_streak_5: streakBroken,
		winning_streak_10: streakBroken,
	},

	account_created: { willkommen: always1 },
	profile_picture_set: { bild: always1 },
};

// ── Catalogue, progress and unlocks ────────────────────────────────────────

type CatalogueEntry = {
	id: string;
	key: string;
	targetValue: number | null;
	unlocked: boolean;
	/** Stored progress, null if none yet. */
	progress: number | null;
};

/** Active achievements (optionally only some keys) with the user's state. */
async function loadCatalogue(
	scope: Scope,
	userId: string,
	keys?: string[],
): Promise<CatalogueEntry[]> {
	const rows = await scope.db
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

type Outcome = { achievement: CatalogueEntry; value: number };

/**
 * Writes new progress values (only those that changed) and unlocks every
 * not yet unlocked achievement whose value reached its target, in one batch.
 */
async function saveOutcomes(
	scope: Scope,
	userId: string,
	outcomes: Outcome[],
): Promise<void> {
	const now = new Date();
	const writes: BatchItem<"sqlite">[] = [];
	for (const { achievement, value } of outcomes) {
		if (value !== achievement.progress) {
			writes.push(
				scope.db
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
				scope.db
					.insert(userAchievements)
					.values({ userId, achievementId: achievement.id, unlockedAt: now })
					.onConflictDoNothing(),
			);
		}
	}
	await runBatch(scope.db, writes);
}

function ruleInput(userId: string, context?: OrderEventContext): RuleInput {
	const now = new Date();
	return { userId, context, now, zoned: getZonedParts(now) };
}

export async function checkAndUnlockAchievements(
	userId: string,
	event: AchievementEvent,
	context?: OrderEventContext,
	options: TrackingOptions = {},
): Promise<void> {
	try {
		const scope = await resolveScope(options);
		const rules = RULES[event];
		const input = ruleInput(userId, context);

		// Unlocked achievements are no longer tracked.
		const pending = (
			await loadCatalogue(scope, userId, Object.keys(rules))
		).flatMap((achievement) => {
			const rule = rules[achievement.key];
			if (!rule || achievement.unlocked || (rule.when && !rule.when(input))) {
				return [];
			}
			return [{ achievement, rule }];
		});
		if (pending.length === 0) {
			return;
		}

		const stats = await loadStats(
			scope,
			userId,
			pending.flatMap(({ rule }) => rule.needs ?? []),
			input,
		);
		const outcomes: Outcome[] = [];
		for (const { achievement, rule } of pending) {
			const value = rule.value(stats, input);
			if (value !== null) {
				outcomes.push({ achievement, value });
			}
		}
		await saveOutcomes(scope, userId, outcomes);
	} catch (error) {
		console.error("Achievement tracking error:", error);
		// Never throw — achievement tracking must not break the calling action
	}
}

// ── Historical helpers (used during seed to check past data) ───────────────

/** The Berlin hour of each of the user's orders, keyed by Berlin day. */
async function getOrderHours(
	scope: Scope,
	userId: string,
): Promise<OrderHour[]> {
	const rows = await scope.db
		.select({ amount: orders.amount, createdAt: orders.createdAt })
		.from(orders)
		.where(eq(orders.userId, userId));
	return toOrderHours(rows);
}

/** All of the user's games, own and cross-Corps, newest first. */
async function getPlayedGames(
	scope: Scope,
	userId: string,
): Promise<PlayedGame[]> {
	const q = playedGamesQueries(scope, userId);
	const [own, cross] = await Promise.all([q.own, q.cross]);
	return mergeGames(own, cross);
}

async function hasEverOrderedSekt(
	scope: Scope,
	userId: string,
): Promise<number> {
	const result = await scope.db
		.select({ count: sql<number>`count(*)` })
		.from(orders)
		.where(and(eq(orders.userId, userId), like(orders.drinkName, "%Sekt%")));
	return (result[0]?.count ?? 0) > 0 ? 1 : 0;
}

async function hasEverOrderedFullCrate(
	scope: Scope,
	userId: string,
	nameFilter?: string,
): Promise<number> {
	const conditions = nameFilter
		? and(eq(orders.userId, userId), like(orders.drinkName, `%${nameFilter}%`))
		: eq(orders.userId, userId);

	const userOrders = await scope.db
		.select({ amount: orders.amount, kastengroesse: drinks.kastengroesse })
		.from(orders)
		.leftJoin(drinks, eq(drinks.id, orders.drinkId))
		.where(conditions);

	for (const order of userOrders) {
		const kiste = order.kastengroesse ?? 20;
		if (order.amount >= kiste) {
			return 1;
		}
	}
	return 0;
}

/** Most beers ordered within one Berlin day in the given Berlin hours. */
async function getBestBeerDayInHours(
	scope: Scope,
	userId: string,
	hourFilter: (hour: number) => boolean,
): Promise<number> {
	const dayMap = new Map<string, number>();
	for (const order of await getOrderHours(scope, userId)) {
		if (hourFilter(order.hour)) {
			dayMap.set(order.day, (dayMap.get(order.day) ?? 0) + order.amount);
		}
	}
	return dayMap.size === 0 ? 0 : Math.max(...dayMap.values());
}

async function hasEverOrderedOnNewYear(
	scope: Scope,
	userId: string,
): Promise<number> {
	for (const order of await getOrderHours(scope, userId)) {
		if (order.day.endsWith("-01-01") && order.hour === 0) {
			return 1;
		}
	}
	return 0;
}

// Most beers ordered on a Berlin calendar date (month 1-12) in any one year
async function getMaxBeersOnCalendarDate(
	scope: Scope,
	userId: string,
	month: number,
	day: number,
): Promise<number> {
	const suffix = `-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	const yearMap = new Map<string, number>();
	for (const order of await getOrderHours(scope, userId)) {
		if (order.day.endsWith(suffix)) {
			const year = order.day.slice(0, 4);
			yearMap.set(year, (yearMap.get(year) ?? 0) + order.amount);
		}
	}
	return yearMap.size === 0 ? 0 : Math.max(...yearMap.values());
}

async function hasEverPlayedOnOct3(
	scope: Scope,
	userId: string,
): Promise<number> {
	for (const game of await getPlayedGames(scope, userId)) {
		if (dayKeyInTZ(game.playedAt).endsWith("-10-03")) {
			return 1;
		}
	}
	return 0;
}

// Most distinct Berlin game days within any 7-day window
async function getBestWeeklyGameStreak(
	scope: Scope,
	userId: string,
): Promise<number> {
	const allGames = await getPlayedGames(scope, userId);
	if (allGames.length === 0) {
		return 0;
	}

	const days = [...new Set(allGames.map((g) => dayKeyInTZ(g.playedAt)))].sort();

	let best = 0;
	for (const from of days) {
		const count = days.filter((d) => {
			const offset = daysBetween(d, from);
			return offset >= 0 && offset < 7;
		}).length;
		best = Math.max(best, count);
	}
	return best;
}

// ── Recalculate all achievements for a single user from historical data ─────

/** Statistics the recalculation shares with live tracking. */
const RECALC_STATS: StatKey[] = [
	"orderTotals",
	"latestOrderTimes",
	"orderHourBuckets",
	"accountCreatedAt",
	"totalGames",
	"totalWins",
	"latestGames",
];

async function recalculatedValue(
	scope: Scope,
	userId: string,
	key: string,
	stats: Stats,
	input: RuleInput,
): Promise<number | null> {
	switch (key) {
		case "spefuchs":
		case "fuchs":
		case "cb":
		case "iacb":
		case "ah":
		case "aheb":
			return totals(stats).totalBeers;
		case "biertasting":
			return totals(stats).distinctDrinks;
		case "kaisersflotte":
			return await hasEverOrderedSekt(scope, userId);
		case "kisteoderliste":
			return await hasEverOrderedFullCrate(scope, userId);
		case "alkoholfrei":
			return await hasEverOrderedFullCrate(scope, userId, "alkoholfrei");
		case "radler":
			return totals(stats).radler;
		case "cbesuch":
		case "cbesuch2":
		case "cbesuch3":
		case "cbesuch4":
			return totals(stats).cbesuch;
		case "helleseite":
			return totals(stats).hell - totals(stats).pils;
		case "dunkleseite":
			return totals(stats).pils - totals(stats).hell;
		case "avatar": {
			const t = totals(stats);
			return Math.abs(t.hell - t.pils) < 10 ? t.totalBeers : 0;
		}
		case "first_tab":
			return totals(stats).totalBeers > 0 ? 1 : 0;
		case "big_spender":
		case "whale":
			return totals(stats).totalSpent;
		case "fruhaufsteher":
			return (await getBestBeerDayInHours(scope, userId, isMorning)) >= 4
				? 1
				: 0;
		case "goldenestunde":
			return totals(stats).ordersLastHour;
		case "wocheende":
			return consecutiveWeekends(stats.get("latestOrderTimes"));
		case "dedication":
			return distinctOrderDays(stats.get("orderHourBuckets"));
		case "berry":
			return (await getBestBeerDayInHours(scope, userId, isMidnight)) >= 4
				? 1
				: 0;
		case "neujahr":
			return await hasEverOrderedOnNewYear(scope, userId);
		case "erstermai":
			return await getMaxBeersOnCalendarDate(scope, userId, 5, 1);
		case "grundungstag":
			return await getMaxBeersOnCalendarDate(scope, userId, 2, 21);
		case "deutschland":
			return await hasEverPlayedOnOct3(scope, userId);
		case "tierlunge":
		case "jungerfuchs":
		case "jungaktiver":
			return stats.get("totalGames");
		case "erstersieg":
		case "champion":
			return stats.get("totalWins");
		case "perfektewoche":
			return await getBestWeeklyGameStreak(scope, userId);
		case "winning_streak_3":
		case "winning_streak_5":
		case "winning_streak_10":
			return currentStreak(stats.get("latestGames"), userId);
		case "willkommen":
			return 1;
		case "bild": {
			const user = await scope.db
				.select({ image: users.image })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);
			return user[0]?.image ? 1 : 0;
		}
		case "biergeburtstag":
			return accountAgeInDays(stats.get("accountCreatedAt"), input.now);
		default:
			return null;
	}
}

export async function recalculateAllAchievements(
	userId: string,
	options: TrackingOptions = {},
): Promise<void> {
	const scope = await resolveScope(options);
	const input = ruleInput(userId);
	const [catalogue, stats] = await Promise.all([
		loadCatalogue(scope, userId),
		loadStats(scope, userId, RECALC_STATS, input),
	]);

	const outcomes: Outcome[] = [];
	for (const achievement of catalogue) {
		const value = await recalculatedValue(
			scope,
			userId,
			achievement.key,
			stats,
			input,
		);
		if (value !== null) {
			outcomes.push({ achievement, value });
		}
	}
	await saveOutcomes(scope, userId, outcomes);
}
