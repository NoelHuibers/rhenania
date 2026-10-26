import { and, asc, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { db } from "~/server/db";
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

		// ── Time-based ────────────────────────────────────────────────────
		// targetValue=1: unlocks once after 4 beers between 05:00–08:00
		case "fruhaufsteher": {
			if (event === "order_created") {
				const hour = new Date().getHours();
				if (hour >= 5 && hour < 8) {
					const count = await getMorningBeerCount(scope, userId);
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
				const day = new Date().getDay();
				if (day === 0 || day === 6) {
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
				if (new Date().getHours() === 0) {
					const count = await getMidnightBeerCount(scope, userId);
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
				const now = new Date();
				if (
					now.getMonth() === 0 &&
					now.getDate() === 1 &&
					now.getHours() === 0
				) {
					newValue = 1;
				}
			}
			break;
		}

		// targetValue=10: sum of beers ordered on May 1
		case "erstermai": {
			if (event === "order_created") {
				const now = new Date();
				if (now.getMonth() === 4 && now.getDate() === 1) {
					newValue = await getOrdersOnDate(scope, userId, 4, 1);
				}
			}
			break;
		}

		// targetValue=10: sum of beers ordered on Feb 21
		case "grundungstag": {
			if (event === "order_created") {
				const now = new Date();
				if (now.getMonth() === 1 && now.getDate() === 21) {
					newValue = await getOrdersOnDate(scope, userId, 1, 21);
				}
			}
			break;
		}

		// targetValue=1: play a game on Oct 3 (German Unity Day)
		case "deutschland": {
			if (event === "game_played") {
				const now = new Date();
				if (now.getMonth() === 9 && now.getDate() === 3) {
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

// Beers ordered today between 05:00 and 08:00
async function getMorningBeerCount(
	scope: Scope,
	userId: string,
): Promise<number> {
	const now = new Date();
	const from = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		5,
		0,
		0,
	);
	const to = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		8,
		0,
		0,
	);
	const result = await scope.db
		.select({ total: sql<number>`coalesce(sum(${orders.amount}), 0)` })
		.from(orders)
		.where(
			and(
				eq(orders.userId, userId),
				gte(orders.createdAt, from),
				lte(orders.createdAt, to),
			),
		);
	return result[0]?.total ?? 0;
}

// Number of order rows created in the last 60 minutes
async function getOrdersInLastHour(
	scope: Scope,
	userId: string,
): Promise<number> {
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
	const result = await scope.db
		.select({ count: sql<number>`count(*)` })
		.from(orders)
		.where(and(eq(orders.userId, userId), gte(orders.createdAt, oneHourAgo)));
	return result[0]?.count ?? 0;
}

// Distinct calendar days on which the user placed at least one order
async function getDistinctOrderDays(
	scope: Scope,
	userId: string,
): Promise<number> {
	const result = await scope.db
		.select({
			count: sql<number>`count(distinct date(${orders.createdAt}, 'unixepoch'))`,
		})
		.from(orders)
		.where(eq(orders.userId, userId));
	return result[0]?.count ?? 0;
}

// Beers ordered today between 00:00 and 01:00
async function getMidnightBeerCount(
	scope: Scope,
	userId: string,
): Promise<number> {
	const now = new Date();
	const from = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		0,
		0,
		0,
	);
	const to = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		1,
		0,
		0,
	);
	const result = await scope.db
		.select({ total: sql<number>`coalesce(sum(${orders.amount}), 0)` })
		.from(orders)
		.where(
			and(
				eq(orders.userId, userId),
				gte(orders.createdAt, from),
				lte(orders.createdAt, to),
			),
		);
	return result[0]?.total ?? 0;
}

// Sum of beers ordered on a specific calendar date (month 0-indexed)
async function getOrdersOnDate(
	scope: Scope,
	userId: string,
	month: number,
	day: number,
): Promise<number> {
	const now = new Date();
	const from = new Date(now.getFullYear(), month, day, 0, 0, 0);
	const to = new Date(now.getFullYear(), month, day + 1, 0, 0, 0);
	const result = await scope.db
		.select({ total: sql<number>`coalesce(sum(${orders.amount}), 0)` })
		.from(orders)
		.where(
			and(
				eq(orders.userId, userId),
				gte(orders.createdAt, from),
				lte(orders.createdAt, to),
			),
		);
	return result[0]?.total ?? 0;
}

async function getTotalGames(scope: Scope, userId: string): Promise<number> {
	const result = await scope.db
		.select({ count: sql<number>`count(*)` })
		.from(games)
		.where(or(eq(games.player1Id, userId), eq(games.player2Id, userId)));
	return result[0]?.count ?? 0;
}

async function getTotalWins(scope: Scope, userId: string): Promise<number> {
	const result = await scope.db
		.select({ count: sql<number>`count(*)` })
		.from(games)
		.where(eq(games.winnerId, userId));
	return result[0]?.count ?? 0;
}

// Count consecutive wins from the most recent games
async function getCurrentStreak(scope: Scope, userId: string): Promise<number> {
	const recentGames = await scope.db
		.select({ winnerId: games.winnerId })
		.from(games)
		.where(or(eq(games.player1Id, userId), eq(games.player2Id, userId)))
		.orderBy(desc(games.playedAt))
		.limit(20);

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

// Distinct days the user played a game within the last 7 days
async function getDistinctGameDaysLastWeek(
	scope: Scope,
	userId: string,
): Promise<number> {
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	const result = await scope.db
		.select({
			count: sql<number>`count(distinct date(${games.playedAt}, 'unixepoch'))`,
		})
		.from(games)
		.where(
			and(
				or(eq(games.player1Id, userId), eq(games.player2Id, userId)),
				gte(games.playedAt, sevenDaysAgo),
			),
		);
	return result[0]?.count ?? 0;
}

// Count consecutive weekends (Sat/Sun) on which the user placed at least one order
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

	// Normalize each weekend order to its Saturday date string
	const weekSaturdays = new Set<string>();
	for (const order of recentOrders) {
		const d = order.createdAt.getDay(); // 0=Sun, 6=Sat
		if (d === 0 || d === 6) {
			const sat = new Date(order.createdAt);
			sat.setDate(sat.getDate() + (d === 6 ? 0 : -1));
			sat.setHours(0, 0, 0, 0);
			// biome-ignore lint/style/noNonNullAssertion: ISO string always has a date part before "T"
			weekSaturdays.add(sat.toISOString().split("T")[0]!);
		}
	}

	const sorted = Array.from(weekSaturdays).sort().reverse();
	if (sorted.length === 0) {
		return 0;
	}

	let streak = 1;
	for (let i = 1; i < sorted.length; i++) {
		// biome-ignore lint/style/noNonNullAssertion: within loop bounds
		const prev = new Date(sorted[i - 1]!).getTime();
		// biome-ignore lint/style/noNonNullAssertion: within loop bounds
		const curr = new Date(sorted[i]!).getTime();
		const diffDays = Math.round((prev - curr) / (1000 * 60 * 60 * 24));
		if (diffDays === 7) {
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

async function getBestMorningBeerDay(
	scope: Scope,
	userId: string,
): Promise<number> {
	const allOrders = await scope.db
		.select({ amount: orders.amount, createdAt: orders.createdAt })
		.from(orders)
		.where(eq(orders.userId, userId));

	const dayMap = new Map<string, number>();
	for (const order of allOrders) {
		const h = order.createdAt.getHours();
		if (h >= 5 && h < 8) {
			// biome-ignore lint/style/noNonNullAssertion: ISO string always has a date part before "T"
			const key = order.createdAt.toISOString().split("T")[0]!;
			dayMap.set(key, (dayMap.get(key) ?? 0) + order.amount);
		}
	}
	return dayMap.size === 0 ? 0 : Math.max(...dayMap.values());
}

async function getBestMidnightBeerDay(
	scope: Scope,
	userId: string,
): Promise<number> {
	const allOrders = await scope.db
		.select({ amount: orders.amount, createdAt: orders.createdAt })
		.from(orders)
		.where(eq(orders.userId, userId));

	const dayMap = new Map<string, number>();
	for (const order of allOrders) {
		if (order.createdAt.getHours() === 0) {
			// biome-ignore lint/style/noNonNullAssertion: ISO string always has a date part before "T"
			const key = order.createdAt.toISOString().split("T")[0]!;
			dayMap.set(key, (dayMap.get(key) ?? 0) + order.amount);
		}
	}
	return dayMap.size === 0 ? 0 : Math.max(...dayMap.values());
}

async function hasEverOrderedOnNewYear(
	scope: Scope,
	userId: string,
): Promise<number> {
	const allOrders = await scope.db
		.select({ createdAt: orders.createdAt })
		.from(orders)
		.where(eq(orders.userId, userId));

	for (const order of allOrders) {
		const d = order.createdAt;
		if (d.getMonth() === 0 && d.getDate() === 1 && d.getHours() === 0) {
			return 1;
		}
	}
	return 0;
}

async function getMaxBeersOnCalendarDate(
	scope: Scope,
	userId: string,
	month: number,
	day: number,
): Promise<number> {
	const allOrders = await scope.db
		.select({ amount: orders.amount, createdAt: orders.createdAt })
		.from(orders)
		.where(eq(orders.userId, userId));

	const yearMap = new Map<number, number>();
	for (const order of allOrders) {
		const d = order.createdAt;
		if (d.getMonth() === month && d.getDate() === day) {
			const year = d.getFullYear();
			yearMap.set(year, (yearMap.get(year) ?? 0) + order.amount);
		}
	}
	return yearMap.size === 0 ? 0 : Math.max(...yearMap.values());
}

async function hasEverPlayedOnOct3(
	scope: Scope,
	userId: string,
): Promise<number> {
	const allGames = await scope.db
		.select({ playedAt: games.playedAt })
		.from(games)
		.where(or(eq(games.player1Id, userId), eq(games.player2Id, userId)));

	for (const game of allGames) {
		const d = game.playedAt;
		if (d.getMonth() === 9 && d.getDate() === 3) {
			return 1;
		}
	}
	return 0;
}

async function getBestWeeklyGameStreak(
	scope: Scope,
	userId: string,
): Promise<number> {
	const allGames = await scope.db
		.select({ playedAt: games.playedAt })
		.from(games)
		.where(or(eq(games.player1Id, userId), eq(games.player2Id, userId)))
		.orderBy(asc(games.playedAt));

	if (allGames.length === 0) {
		return 0;
	}

	const days = [
		// biome-ignore lint/style/noNonNullAssertion: ISO string always has a date part before "T"
		...new Set(allGames.map((g) => g.playedAt.toISOString().split("T")[0]!)),
	].sort();

	let best = 0;
	for (let i = 0; i < days.length; i++) {
		// biome-ignore lint/style/noNonNullAssertion: within loop bounds
		const from = new Date(days[i]!).getTime();
		const to = from + 7 * 24 * 60 * 60 * 1000;
		const count = days.filter((d) => {
			const t = new Date(d).getTime();
			return t >= from && t < to;
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
				value = await getMaxBeersOnCalendarDate(scope, userId, 4, 1);
				break;

			case "grundungstag":
				value = await getMaxBeersOnCalendarDate(scope, userId, 1, 21);
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
