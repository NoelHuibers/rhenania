import { and, desc, eq, gte, like, or, type SQL, sql } from "drizzle-orm";
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

type Achievement = typeof achievements.$inferSelect;

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

export async function checkAndUnlockAchievements(
	userId: string,
	event: AchievementEvent,
	context?: OrderEventContext,
	options: TrackingOptions = {},
): Promise<void> {
	try {
		const scope = await resolveScope(options);
		const [allAchievements, alreadyUnlocked] = await Promise.all([
			scope.db
				.select()
				.from(achievements)
				.where(eq(achievements.isActive, true)),
			scope.db
				.select({ achievementId: userAchievements.achievementId })
				.from(userAchievements)
				.where(eq(userAchievements.userId, userId)),
		]);

		const unlockedSet = new Set(alreadyUnlocked.map((u) => u.achievementId));
		const pending = allAchievements.filter((a) => !unlockedSet.has(a.id));

		for (const achievement of pending) {
			await processAchievement(scope, userId, achievement, event, context);
		}
	} catch (error) {
		console.error("Achievement tracking error:", error);
		// Never throw — achievement tracking must not break the calling action
	}
}

async function processAchievement(
	scope: Scope,
	userId: string,
	achievement: Achievement,
	event: AchievementEvent,
	context?: OrderEventContext,
): Promise<void> {
	let newValue: number | null = null;

	switch (achievement.key) {
		// ── Drinking milestones (total beers ordered) ──────────────────────
		case "spefuchs":
		case "fuchs":
		case "cb":
		case "iacb":
		case "ah":
		case "aheb":
			if (event === "order_created") {
				newValue = await getTotalBeerCount(scope, userId);
			}
			break;

		// ── Drink variety ──────────────────────────────────────────────────
		case "biertasting":
			if (event === "order_created") {
				newValue = await getDistinctDrinkCount(scope, userId);
			}
			break;

		// ── Special drinks ─────────────────────────────────────────────────
		case "kaisersflotte":
			if (
				event === "order_created" &&
				context &&
				/sekt/i.test(context.drinkName)
			) {
				newValue = 1;
			}
			break;

		case "kisteoderliste":
			if (event === "order_created" && context) {
				const drink = await scope.db
					.select({ kastengroesse: drinks.kastengroesse })
					.from(drinks)
					.where(eq(drinks.id, context.drinkId))
					.limit(1);
				const kiste = drink[0]?.kastengroesse;
				if (kiste && context.amount >= kiste) {
					newValue = 1;
				}
			}
			break;

		case "alkoholfrei":
			if (
				event === "order_created" &&
				context &&
				/alkoholfrei/i.test(context.drinkName)
			) {
				const drink = await scope.db
					.select({ kastengroesse: drinks.kastengroesse })
					.from(drinks)
					.where(eq(drinks.id, context.drinkId))
					.limit(1);
				const kiste = drink[0]?.kastengroesse ?? 20;
				if (context.amount >= kiste) {
					newValue = 1;
				}
			}
			break;

		case "radler":
			if (event === "order_created") {
				newValue = await getDrinkCountByName(scope, userId, "Radler");
			}
			break;

		// ── CBesuch drinking ───────────────────────────────────────────────
		// Orders where bookingFor contains "CBesuch" (case-insensitive)
		case "cbesuch":
		case "cbesuch2":
		case "cbesuch3":
		case "cbesuch4":
			if (event === "order_created") {
				newValue = await getCBesuchBeerCount(scope, userId);
			}
			break;

		// ── Oetti Hell / Pils ratio ────────────────────────────────────────
		// targetValue for both is 10, meaning 10 more of one type than the other
		case "helleseite": {
			if (event === "order_created") {
				const { hellCount, pilsCount } = await getHellPilsRatio(scope, userId);
				newValue = hellCount - pilsCount;
			}
			break;
		}

		case "dunkleseite": {
			if (event === "order_created") {
				const { hellCount, pilsCount } = await getHellPilsRatio(scope, userId);
				newValue = pilsCount - hellCount;
			}
			break;
		}

		// targetValue=100, unlocks when total >= 100 AND neither Hell nor Pils
		// dominates by more than the helleseite/dunkleseite threshold (10)
		case "avatar": {
			if (event === "order_created") {
				const total = await getTotalBeerCount(scope, userId);
				const { hellCount, pilsCount } = await getHellPilsRatio(scope, userId);
				if (Math.abs(hellCount - pilsCount) < 10) {
					newValue = total;
				}
			}
			break;
		}

		// ── Financial ─────────────────────────────────────────────────────
		case "first_tab":
			if (event === "order_created") {
				newValue = 1;
			}
			break;

		case "big_spender":
		case "whale":
			if (event === "order_created") {
				newValue = await getTotalSpent(scope, userId);
			}
			break;

		// ── Time-based (Europe/Berlin wall clock, whatever the server zone) ─
		// targetValue=1: unlocks once after 4 beers between 05:00–08:00
		case "fruhaufsteher": {
			if (event === "order_created") {
				const { hour } = getZonedParts(new Date());
				if (hour >= 5 && hour < 8) {
					const count = await getBeersToday(
						scope,
						userId,
						(h) => h >= 5 && h < 8,
					);
					if (count >= 4) {
						newValue = 1;
					}
				}
			}
			break;
		}

		// targetValue=10: tracks order count in the last hour
		case "goldenestunde":
			if (event === "order_created") {
				newValue = await getOrdersInLastHour(scope, userId);
			}
			break;

		// targetValue=10: consecutive weekends with at least one order
		case "wocheende": {
			if (event === "order_created") {
				const { weekday } = getZonedParts(new Date());
				if (weekday === 0 || weekday === 6) {
					newValue = await getConsecutiveWeekends(scope, userId);
				}
			}
			break;
		}

		// targetValue=365: distinct calendar days with at least one order
		case "dedication":
			if (event === "order_created") {
				newValue = await getDistinctOrderDays(scope, userId);
			}
			break;

		// ── Date-specific drinking ─────────────────────────────────────────
		// targetValue=1: 4+ beers ordered between 00:00–01:00
		case "berry": {
			if (event === "order_created") {
				if (getZonedParts(new Date()).hour === 0) {
					const count = await getBeersToday(scope, userId, (h) => h === 0);
					if (count >= 4) {
						newValue = 1;
					}
				}
			}
			break;
		}

		// targetValue=1: any order on Jan 1 between 00:00–01:00
		case "neujahr": {
			if (event === "order_created") {
				const now = getZonedParts(new Date());
				if (now.month === 1 && now.day === 1 && now.hour === 0) {
					newValue = 1;
				}
			}
			break;
		}

		// targetValue=10: sum of beers ordered on May 1
		case "erstermai": {
			if (event === "order_created") {
				const now = getZonedParts(new Date());
				if (now.month === 5 && now.day === 1) {
					newValue = await getBeersToday(scope, userId);
				}
			}
			break;
		}

		// targetValue=10: sum of beers ordered on Feb 21
		case "grundungstag": {
			if (event === "order_created") {
				const now = getZonedParts(new Date());
				if (now.month === 2 && now.day === 21) {
					newValue = await getBeersToday(scope, userId);
				}
			}
			break;
		}

		// targetValue=1: play a game on Oct 3 (German Unity Day)
		case "deutschland": {
			if (event === "game_played") {
				const now = getZonedParts(new Date());
				if (now.month === 10 && now.day === 3) {
					newValue = 1;
				}
			}
			break;
		}

		// ── Games ──────────────────────────────────────────────────────────
		case "tierlunge":
		case "jungerfuchs":
		case "jungaktiver":
			if (event === "game_played") {
				newValue = await getTotalGames(scope, userId);
			}
			break;

		case "erstersieg":
		case "champion":
			if (event === "game_won") {
				newValue = await getTotalWins(scope, userId);
			}
			break;

		// targetValue=7: a game on each of 7 distinct days within the last week
		case "perfektewoche":
			if (event === "game_played") {
				newValue = await getDistinctGameDaysLastWeek(scope, userId);
			}
			break;

		case "winning_streak_3":
		case "winning_streak_5":
		case "winning_streak_10":
			if (event === "game_won") {
				newValue = await getCurrentStreak(scope, userId);
			} else if (event === "game_lost") {
				newValue = 0;
			}
			break;

		// ── Special ────────────────────────────────────────────────────────
		case "willkommen":
			if (event === "account_created") {
				newValue = 1;
			}
			break;

		case "bild":
			if (event === "profile_picture_set") {
				newValue = 1;
			}
			break;

		// targetValue=365: account must be at least one year old
		case "biergeburtstag":
			if (event === "order_created") {
				newValue = await getAccountAgeInDays(scope, userId);
			}
			break;
	}

	if (newValue === null) {
		return;
	}

	await updateProgress(scope, userId, achievement.id, newValue);

	if (achievement.targetValue !== null && newValue >= achievement.targetValue) {
		await unlockAchievement(scope, userId, achievement.id);
	}
}

// ── Query helpers ──────────────────────────────────────────────────────────

async function getTotalBeerCount(
	scope: Scope,
	userId: string,
): Promise<number> {
	const result = await scope.db
		.select({ total: sql<number>`coalesce(sum(${orders.amount}), 0)` })
		.from(orders)
		.where(eq(orders.userId, userId));
	return result[0]?.total ?? 0;
}

async function getDistinctDrinkCount(
	scope: Scope,
	userId: string,
): Promise<number> {
	const result = await scope.db
		.select({ count: sql<number>`count(distinct ${orders.drinkId})` })
		.from(orders)
		.where(eq(orders.userId, userId));
	return result[0]?.count ?? 0;
}

async function getDrinkCountByName(
	scope: Scope,
	userId: string,
	namePattern: string,
): Promise<number> {
	const result = await scope.db
		.select({ total: sql<number>`coalesce(sum(${orders.amount}), 0)` })
		.from(orders)
		.where(
			and(
				eq(orders.userId, userId),
				like(orders.drinkName, `%${namePattern}%`),
			),
		);
	return result[0]?.total ?? 0;
}

// Counts beers where bookingFor contains "CBesuch" (case-insensitive via LIKE)
async function getCBesuchBeerCount(
	scope: Scope,
	userId: string,
): Promise<number> {
	const result = await scope.db
		.select({ total: sql<number>`coalesce(sum(${orders.amount}), 0)` })
		.from(orders)
		.where(
			and(eq(orders.userId, userId), like(orders.bookingFor, "%CBesuch%")),
		);
	return result[0]?.total ?? 0;
}

async function getHellPilsRatio(
	scope: Scope,
	userId: string,
): Promise<{ hellCount: number; pilsCount: number }> {
	const [hellResult, pilsResult] = await Promise.all([
		scope.db
			.select({ total: sql<number>`coalesce(sum(${orders.amount}), 0)` })
			.from(orders)
			.where(
				and(
					eq(orders.userId, userId),
					or(
						like(orders.drinkName, "%Hell%"),
						like(orders.drinkName, "%Helles%"),
					),
				),
			),
		scope.db
			.select({ total: sql<number>`coalesce(sum(${orders.amount}), 0)` })
			.from(orders)
			.where(and(eq(orders.userId, userId), like(orders.drinkName, "%Pils%"))),
	]);

	return {
		hellCount: hellResult[0]?.total ?? 0,
		pilsCount: pilsResult[0]?.total ?? 0,
	};
}

async function getTotalSpent(scope: Scope, userId: string): Promise<number> {
	const result = await scope.db
		.select({ total: sql<number>`coalesce(sum(${orders.total}), 0)` })
		.from(orders)
		.where(eq(orders.userId, userId));
	return result[0]?.total ?? 0;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The Berlin hour of each of the user's orders since `since`, keyed by Berlin day. */
async function getOrderHours(
	scope: Scope,
	userId: string,
	since?: Date,
): Promise<Array<{ day: string; hour: number; amount: number }>> {
	const rows = await scope.db
		.select({ amount: orders.amount, createdAt: orders.createdAt })
		.from(orders)
		.where(
			since
				? and(eq(orders.userId, userId), gte(orders.createdAt, since))
				: eq(orders.userId, userId),
		);
	return rows.map((r) => {
		const parts = getZonedParts(r.createdAt);
		return { day: dayKeyInTZ(r.createdAt), hour: parts.hour, amount: r.amount };
	});
}

/**
 * Beers the user ordered today (Berlin calendar day), optionally only those
 * whose Berlin hour passes `hourFilter`.
 */
async function getBeersToday(
	scope: Scope,
	userId: string,
	hourFilter: (hour: number) => boolean = () => true,
): Promise<number> {
	const now = new Date();
	const today = dayKeyInTZ(now);
	// A Berlin day is at most 25 h long, so this window always covers it.
	const rows = await getOrderHours(
		scope,
		userId,
		new Date(now.getTime() - 25 * HOUR_MS),
	);
	let total = 0;
	for (const r of rows) {
		if (r.day === today && hourFilter(r.hour)) {
			total += r.amount;
		}
	}
	return total;
}

// Number of order rows created in the last 60 minutes
async function getOrdersInLastHour(
	scope: Scope,
	userId: string,
): Promise<number> {
	const oneHourAgo = new Date(Date.now() - HOUR_MS);
	const result = await scope.db
		.select({ count: sql<number>`count(*)` })
		.from(orders)
		.where(and(eq(orders.userId, userId), gte(orders.createdAt, oneHourAgo)));
	return result[0]?.count ?? 0;
}

// Distinct Berlin calendar days on which the user placed at least one order
async function getDistinctOrderDays(
	scope: Scope,
	userId: string,
): Promise<number> {
	// Berlin is a whole number of hours off UTC, so every UTC hour lies within
	// one Berlin day: bucket by hour in SQL, map the buckets to days here.
	const rows = await scope.db
		.selectDistinct({ hour: sql<number>`${orders.createdAt} / 3600` })
		.from(orders)
		.where(eq(orders.userId, userId));
	const days = new Set<string>();
	for (const { hour } of rows) {
		days.add(dayKeyInTZ(new Date(hour * HOUR_MS)));
	}
	return days.size;
}

// ── Games (the Corps' own games plus its members' cross-Corps games) ───────

type PlayedGame = { winnerId: string; playedAt: Date };

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

function ownGamesOf(userId: string): SQL | undefined {
	return or(eq(games.player1Id, userId), eq(games.player2Id, userId));
}

/** The user's games, newest first, optionally since a date / limited. */
async function getPlayedGames(
	scope: Scope,
	userId: string,
	opts: { since?: Date; limit?: number } = {},
): Promise<PlayedGame[]> {
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
	const [ownRows, crossRows] = await Promise.all(
		opts.limit === undefined
			? [own, cross]
			: [own.limit(opts.limit), cross.limit(opts.limit)],
	);
	const all = [...ownRows, ...crossRows].sort(
		(a, b) => b.playedAt.getTime() - a.playedAt.getTime(),
	);
	return opts.limit === undefined ? all : all.slice(0, opts.limit);
}

async function getTotalGames(scope: Scope, userId: string): Promise<number> {
	const [own, cross] = await Promise.all([
		scope.db
			.select({ count: sql<number>`count(*)` })
			.from(games)
			.where(ownGamesOf(userId)),
		controlDb
			.select({ count: sql<number>`count(*)` })
			.from(crossTenantGames)
			.where(crossGamesOf(scope, userId)),
	]);
	return (own[0]?.count ?? 0) + (cross[0]?.count ?? 0);
}

async function getTotalWins(scope: Scope, userId: string): Promise<number> {
	const [own, cross] = await Promise.all([
		scope.db
			.select({ count: sql<number>`count(*)` })
			.from(games)
			.where(eq(games.winnerId, userId)),
		controlDb
			.select({ count: sql<number>`count(*)` })
			.from(crossTenantGames)
			.where(
				and(eq(crossTenantGames.winnerId, userId), crossGamesOf(scope, userId)),
			),
	]);
	return (own[0]?.count ?? 0) + (cross[0]?.count ?? 0);
}

// Count consecutive wins from the most recent games
async function getCurrentStreak(scope: Scope, userId: string): Promise<number> {
	const recentGames = await getPlayedGames(scope, userId, { limit: 20 });

	let streak = 0;
	for (const game of recentGames) {
		if (game.winnerId === userId) {
			streak++;
		} else {
			break;
		}
	}
	return streak;
}

// Distinct Berlin days the user played a game within the last 7 days
async function getDistinctGameDaysLastWeek(
	scope: Scope,
	userId: string,
): Promise<number> {
	const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS);
	const recent = await getPlayedGames(scope, userId, { since: sevenDaysAgo });
	return new Set(recent.map((g) => dayKeyInTZ(g.playedAt))).size;
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

// Count consecutive weekends (Sat/Sun, Berlin time) with at least one order
async function getConsecutiveWeekends(
	scope: Scope,
	userId: string,
): Promise<number> {
	const recentOrders = await scope.db
		.select({ createdAt: orders.createdAt })
		.from(orders)
		.where(eq(orders.userId, userId))
		.orderBy(desc(orders.createdAt))
		.limit(200);

	// Normalize each weekend order to its Saturday's Berlin date
	const weekSaturdays = new Set<string>();
	for (const order of recentOrders) {
		const { weekday } = getZonedParts(order.createdAt); // 0=Sun, 6=Sat
		if (weekday === 0 || weekday === 6) {
			const day = dayKeyInTZ(order.createdAt);
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

// Account age in full days, based on account creation timestamp
async function getAccountAgeInDays(
	scope: Scope,
	userId: string,
): Promise<number> {
	const user = await scope.db
		.select({ createdAt: users.createdAt })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);

	if (!user[0]?.createdAt) {
		return 0;
	}
	return Math.floor(
		(Date.now() - user[0].createdAt.getTime()) / (1000 * 60 * 60 * 24),
	);
}

// ── Progress / unlock helpers ──────────────────────────────────────────────

async function updateProgress(
	scope: Scope,
	userId: string,
	achievementId: string,
	value: number,
): Promise<void> {
	await scope.db
		.insert(achievementProgress)
		.values({
			userId,
			achievementId,
			currentValue: value,
			lastUpdated: new Date(),
		})
		.onConflictDoUpdate({
			target: [achievementProgress.userId, achievementProgress.achievementId],
			set: { currentValue: value, lastUpdated: new Date() },
		});
}

async function unlockAchievement(
	scope: Scope,
	userId: string,
	achievementId: string,
): Promise<void> {
	await scope.db
		.insert(userAchievements)
		.values({ userId, achievementId, unlockedAt: new Date() })
		.onConflictDoNothing();
}

// ── Historical helpers (used during seed to check past data) ───────────────

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
		.select({ drinkId: orders.drinkId, amount: orders.amount })
		.from(orders)
		.where(conditions);

	for (const order of userOrders) {
		const drink = await scope.db
			.select({ kastengroesse: drinks.kastengroesse })
			.from(drinks)
			.where(eq(drinks.id, order.drinkId))
			.limit(1);
		const kiste = drink[0]?.kastengroesse ?? 20;
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

async function getBestMorningBeerDay(
	scope: Scope,
	userId: string,
): Promise<number> {
	return await getBestBeerDayInHours(scope, userId, (h) => h >= 5 && h < 8);
}

async function getBestMidnightBeerDay(
	scope: Scope,
	userId: string,
): Promise<number> {
	return await getBestBeerDayInHours(scope, userId, (h) => h === 0);
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

export async function recalculateAllAchievements(
	userId: string,
	options: TrackingOptions = {},
): Promise<void> {
	const scope = await resolveScope(options);
	const [allAchievements, alreadyUnlocked] = await Promise.all([
		scope.db.select().from(achievements).where(eq(achievements.isActive, true)),
		scope.db
			.select({ achievementId: userAchievements.achievementId })
			.from(userAchievements)
			.where(eq(userAchievements.userId, userId)),
	]);

	const unlockedSet = new Set(alreadyUnlocked.map((u) => u.achievementId));

	for (const achievement of allAchievements) {
		let value: number | null = null;

		switch (achievement.key) {
			case "spefuchs":
			case "fuchs":
			case "cb":
			case "iacb":
			case "ah":
			case "aheb":
				value = await getTotalBeerCount(scope, userId);
				break;

			case "biertasting":
				value = await getDistinctDrinkCount(scope, userId);
				break;

			case "kaisersflotte":
				value = await hasEverOrderedSekt(scope, userId);
				break;

			case "kisteoderliste":
				value = await hasEverOrderedFullCrate(scope, userId);
				break;

			case "alkoholfrei":
				value = await hasEverOrderedFullCrate(scope, userId, "alkoholfrei");
				break;

			case "radler":
				value = await getDrinkCountByName(scope, userId, "Radler");
				break;

			case "cbesuch":
			case "cbesuch2":
			case "cbesuch3":
			case "cbesuch4":
				value = await getCBesuchBeerCount(scope, userId);
				break;

			case "helleseite": {
				const { hellCount, pilsCount } = await getHellPilsRatio(scope, userId);
				value = hellCount - pilsCount;
				break;
			}

			case "dunkleseite": {
				const { hellCount, pilsCount } = await getHellPilsRatio(scope, userId);
				value = pilsCount - hellCount;
				break;
			}

			case "avatar": {
				const total = await getTotalBeerCount(scope, userId);
				const { hellCount, pilsCount } = await getHellPilsRatio(scope, userId);
				value = Math.abs(hellCount - pilsCount) < 10 ? total : 0;
				break;
			}

			case "first_tab": {
				const count = await getTotalBeerCount(scope, userId);
				value = count > 0 ? 1 : 0;
				break;
			}

			case "big_spender":
			case "whale":
				value = await getTotalSpent(scope, userId);
				break;

			case "fruhaufsteher": {
				const best = await getBestMorningBeerDay(scope, userId);
				value = best >= 4 ? 1 : 0;
				break;
			}

			case "goldenestunde":
				value = await getOrdersInLastHour(scope, userId);
				break;

			case "wocheende":
				value = await getConsecutiveWeekends(scope, userId);
				break;

			case "dedication":
				value = await getDistinctOrderDays(scope, userId);
				break;

			case "berry": {
				const best = await getBestMidnightBeerDay(scope, userId);
				value = best >= 4 ? 1 : 0;
				break;
			}

			case "neujahr":
				value = await hasEverOrderedOnNewYear(scope, userId);
				break;

			case "erstermai":
				value = await getMaxBeersOnCalendarDate(scope, userId, 5, 1);
				break;

			case "grundungstag":
				value = await getMaxBeersOnCalendarDate(scope, userId, 2, 21);
				break;

			case "deutschland":
				value = await hasEverPlayedOnOct3(scope, userId);
				break;

			case "tierlunge":
			case "jungerfuchs":
			case "jungaktiver":
				value = await getTotalGames(scope, userId);
				break;

			case "erstersieg":
			case "champion":
				value = await getTotalWins(scope, userId);
				break;

			case "perfektewoche":
				value = await getBestWeeklyGameStreak(scope, userId);
				break;

			case "winning_streak_3":
			case "winning_streak_5":
			case "winning_streak_10":
				value = await getCurrentStreak(scope, userId);
				break;

			case "willkommen":
				value = 1;
				break;

			case "bild": {
				const user = await scope.db
					.select({ image: users.image })
					.from(users)
					.where(eq(users.id, userId))
					.limit(1);
				value = user[0]?.image ? 1 : 0;
				break;
			}

			case "biergeburtstag":
				value = await getAccountAgeInDays(scope, userId);
				break;
		}

		if (value === null) {
			continue;
		}

		await updateProgress(scope, userId, achievement.id, value);

		if (
			!unlockedSet.has(achievement.id) &&
			achievement.targetValue !== null &&
			value >= achievement.targetValue
		) {
			await unlockAchievement(scope, userId, achievement.id);
			unlockedSet.add(achievement.id);
		}
	}
}
