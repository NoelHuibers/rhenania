// repo.ts — drink orders in the tenant DB (#33).
//
// Drizzle reads and writes of the orders: booking one, a member's order
// pages, the unbilled orders and the Literboard's sums. Every function
// takes the database it runs on; none checks the caller, applies a rule or
// revalidates a page. A read that may find nothing returns null or []; a
// failed query throws.

import "server-only";

import {
	and,
	count,
	desc,
	eq,
	gte,
	isNull,
	lt,
	lte,
	type SQL,
	sql,
} from "drizzle-orm";
import { drinks, orders, users } from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";

export type OrderInsert = typeof orders.$inferInsert;

// ─── Booking ─────────────────────────────────────────────────────────────────

/** The member's name, or null if there is none. */
export async function userName(
	db: TenantDb,
	userId: string,
): Promise<string | null> {
	const [row] = await db
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row?.name ?? null;
}

/** What booking a drink needs of it, or null if there is no such drink. */
export async function drinkForOrder(db: TenantDb, drinkId: string) {
	const [drink] = await db
		.select({ id: drinks.id, name: drinks.name, price: drinks.price })
		.from(drinks)
		.where(eq(drinks.id, drinkId))
		.limit(1);
	return drink ?? null;
}

/** Books the order; its id. */
export async function insertOrder(
	db: TenantDb,
	values: OrderInsert,
): Promise<string | undefined> {
	const [row] = await db
		.insert(orders)
		.values(values)
		.returning({ id: orders.id });
	return row?.id;
}

// ─── A member's orders ───────────────────────────────────────────────────────

type OrderFilter = {
	userId: string;
	outOfBillOnly: boolean;
	from: Date | null;
	to: Date | null;
};

/**
 * One page of the member's orders, newest first, and how many match the
 * filter: one round trip.
 */
export async function orderPage(
	db: TenantDb,
	filter: OrderFilter,
	page: { limit: number; offset: number },
) {
	const where = and(
		eq(orders.userId, filter.userId),
		filter.outOfBillOnly ? eq(orders.inBill, false) : undefined,
		filter.from ? gte(orders.createdAt, filter.from) : undefined,
		filter.to ? lte(orders.createdAt, filter.to) : undefined,
	);
	const [rows, [counted]] = await db.batch([
		db
			.select({
				id: orders.id,
				createdAt: orders.createdAt,
				drinkName: orders.drinkName,
				amount: orders.amount,
				total: orders.total,
				inBill: orders.inBill,
			})
			.from(orders)
			.where(where)
			.orderBy(desc(orders.createdAt), desc(sql`${orders}.rowid`))
			.limit(page.limit)
			.offset(page.offset),
		db.select({ total: count() }).from(orders).where(where),
	]);
	return { rows, total: counted?.total ?? 0 };
}

// ─── The unbilled orders ─────────────────────────────────────────────────────

/**
 * Every order not yet on a bill, in the order they were placed. Without an
 * ORDER BY, rows come back in whatever order the index SQLite picks yields.
 */
export async function unbilledOrders(db: TenantDb) {
	return db
		.select()
		.from(orders)
		.where(eq(orders.inBill, false))
		.orderBy(orders.createdAt, sql`${orders}.rowid`);
}

// ─── The Literboard ──────────────────────────────────────────────────────────
//
// The periods are relative to SQLite's clock (`unixepoch('now')`).

const sixMonthsAgo = sql<number>`unixepoch('now','-6 months')`;
const now = sql<number>`unixepoch('now')`;
const thirtyOneDaysAgo = sql<number>`unixepoch('now','-31 days')`;
const sixtyTwoDaysAgo = sql<number>`unixepoch('now','-62 days')`;

/**
 * The members who drank most in the last six months (personal orders
 * only), with their litres of the last 31 days and of the 31 before.
 */
export async function topDrinkers(db: TenantDb, limit: number) {
	// Previous 31 days data (62-31 days ago)
	const prevByUser = db
		.select({
			userId: orders.userId,
			prevLiters:
				sql<number>`SUM(CASE WHEN ${drinks.volume} IS NOT NULL THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`.as(
					"prevLiters",
				),
		})
		.from(orders)
		.leftJoin(drinks, eq(orders.drinkId, drinks.id))
		.where(
			and(
				gte(orders.createdAt, sixtyTwoDaysAgo),
				lt(orders.createdAt, thirtyOneDaysAgo),
				isNull(orders.bookingFor),
			),
		)
		.groupBy(orders.userId)
		.as("prevByUser");

	// Last 31 days data with 6-month total for leaderboard ranking
	return db
		.select({
			userId: orders.userId,
			userName: orders.userName,
			avatar: users.image,
			// Total liters for last 6 months (for ranking)
			liters:
				sql<number>`SUM(CASE WHEN ${drinks.volume} IS NOT NULL AND ${orders.createdAt} >= ${sixMonthsAgo} THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`.as(
					"liters",
				),
			// Last 31 days liters (for change percentage calculation)
			lastThirtyOneDaysLiters:
				sql<number>`SUM(CASE WHEN ${drinks.volume} IS NOT NULL AND ${orders.createdAt} >= ${thirtyOneDaysAgo} THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`.as(
					"lastThirtyOneDaysLiters",
				),
			prevLiters: prevByUser.prevLiters,
		})
		.from(orders)
		.leftJoin(drinks, eq(orders.drinkId, drinks.id))
		.leftJoin(users, eq(orders.userId, users.id))
		.leftJoin(prevByUser, eq(prevByUser.userId, orders.userId))
		.where(and(gte(orders.createdAt, sixMonthsAgo), isNull(orders.bookingFor)))
		.groupBy(orders.userId)
		.orderBy(
			desc(
				sql`SUM(CASE WHEN ${drinks.volume} IS NOT NULL AND ${orders.createdAt} >= ${sixMonthsAgo} THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`,
			),
		)
		.limit(limit);
}

/** Personal litres of the last 31 days and of the 31 before. */
export async function litresLastTwoMonths(db: TenantDb) {
	const [row] = await db
		.select({
			lastThirtyOneDaysLiters: sql<number>`
        SUM(
          CASE WHEN ${orders.createdAt} >= ${thirtyOneDaysAgo}
                 AND ${drinks.volume} IS NOT NULL
                 AND ${orders.bookingFor} IS NULL
               THEN ${orders.amount} * ${drinks.volume}
               ELSE 0
          END
        )
      `.as("lastThirtyOneDaysLiters"),
			prevThirtyOneDaysLiters: sql<number>`
        SUM(
          CASE WHEN ${orders.createdAt} >= ${sixtyTwoDaysAgo}
                 AND ${orders.createdAt} < ${thirtyOneDaysAgo}
                 AND ${drinks.volume} IS NOT NULL
                 AND ${orders.bookingFor} IS NULL
               THEN ${orders.amount} * ${drinks.volume}
               ELSE 0
          END
        )
      `.as("prevThirtyOneDaysLiters"),
		})
		.from(orders)
		.leftJoin(drinks, eq(orders.drinkId, drinks.id));
	return row ?? null;
}

/** Litres ordered in the last six months (all orders), one row. */
export async function litresLastSixMonths(db: TenantDb) {
	return db
		.select({
			totalLiters: sql<number>`
        SUM(
          CASE WHEN ${orders.createdAt} >= ${sixMonthsAgo}
                 AND ${orders.createdAt} < ${now}
                 AND ${drinks.volume} IS NOT NULL
               THEN ${orders.amount} * ${drinks.volume}
               ELSE 0
          END
        )
      `.as("totalLiters"),
		})
		.from(orders)
		.leftJoin(drinks, eq(orders.drinkId, drinks.id))
		.where(and(gte(orders.createdAt, sixMonthsAgo)));
}

/**
 * Litres per Berlin month (`months`: their starts in unix seconds) and
 * drink, ordered from `months[0]` up to `end` (exclusive). SQLite only knows
 * UTC and the server's own zone, so the month starts come from JS.
 */
export async function litresPerMonthAndDrink(
	db: TenantDb,
	months: number[],
	end: number,
) {
	const lowerBound = months[0] ?? 0;
	const whens: SQL[] = months
		.slice(1)
		.map(
			(monthEnd, i) =>
				sql`WHEN ${orders.createdAt} < ${monthEnd} THEN ${months[i]}`,
		);
	const monthStartExpr = sql<number>`CASE ${sql.join(whens, sql` `)} ELSE ${
		months[months.length - 1]
	} END`;

	return db
		.select({
			monthStart: monthStartExpr,
			drinkId: orders.drinkId,
			drinkName: orders.drinkName,
			liters: sql<number>`
      SUM(CASE WHEN ${drinks.volume} IS NOT NULL
               THEN ${orders.amount} * ${drinks.volume}
               ELSE 0 END)
    `.as("liters"),
		})
		.from(orders)
		.leftJoin(drinks, eq(orders.drinkId, drinks.id))
		.where(
			and(
				gte(orders.createdAt, new Date(lowerBound * 1000)),
				lt(orders.createdAt, new Date(end * 1000)),
			),
		)
		.groupBy(monthStartExpr, orders.drinkId, orders.drinkName)
		.having(sql`liters > 0`)
		.orderBy(monthStartExpr);
}
