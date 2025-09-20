"use server";

import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "~/server/db/index";
import { drinks, orders, users } from "~/server/db/schema";

export type LeaderboardEntry = {
  userId: string;
  userName: string;
  avatar: string | null;
  liters: number;
  prevLiters: number;
  changePct: number | null;
};

const sixMonthsAgo = sql<number>`unixepoch('now','-6 months')`;
const now = sql<number>`unixepoch('now')`;
const thirtyOneDaysAgo = sql<number>`unixepoch('now','-31 days')`;
const sixtyTwoDaysAgo = sql<number>`unixepoch('now','-62 days')`;

export async function getLeaderboardLast6Months({
  limit = 10,
}: { limit?: number } = {}): Promise<LeaderboardEntry[]> {
  // Previous 31 days data (62-31 days ago)
  const prevByUser = db
    .select({
      userId: orders.userId,
      prevLiters:
        sql<number>`SUM(CASE WHEN ${drinks.volume} IS NOT NULL THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`.as(
          "prevLiters"
        ),
    })
    .from(orders)
    .leftJoin(drinks, eq(orders.drinkId, drinks.id))
    .where(
      and(
        gte(orders.createdAt, sixtyTwoDaysAgo),
        lt(orders.createdAt, thirtyOneDaysAgo),
        isNull(orders.bookingFor)
      )
    )
    .groupBy(orders.userId)
    .as("prevByUser");

  // Last 31 days data with 6-month total for leaderboard ranking
  const rows = await db
    .select({
      userId: orders.userId,
      userName: orders.userName,
      avatar: users.image,
      // Total liters for last 6 months (for ranking)
      liters:
        sql<number>`SUM(CASE WHEN ${drinks.volume} IS NOT NULL AND ${orders.createdAt} >= ${sixMonthsAgo} THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`.as(
          "liters"
        ),
      // Last 31 days liters (for change percentage calculation)
      lastThirtyOneDaysLiters:
        sql<number>`SUM(CASE WHEN ${drinks.volume} IS NOT NULL AND ${orders.createdAt} >= ${thirtyOneDaysAgo} THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`.as(
          "lastThirtyOneDaysLiters"
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
        sql`SUM(CASE WHEN ${drinks.volume} IS NOT NULL AND ${orders.createdAt} >= ${sixMonthsAgo} THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`
      )
    )
    .limit(limit);

  return rows.map((r) => {
    const liters = Math.round(((r.liters ?? 0) as number) * 100) / 100;
    const lastThirtyOneDaysLiters =
      Math.round(((r.lastThirtyOneDaysLiters ?? 0) as number) * 100) / 100;
    const prevLiters = Math.round(((r.prevLiters ?? 0) as number) * 100) / 100;

    // Calculate change percentage based on last 31 days vs previous 31 days
    const changePct =
      prevLiters > 0
        ? Math.round(
            ((lastThirtyOneDaysLiters - prevLiters) / prevLiters) * 10000
          ) / 100
        : null;

    return {
      userId: r.userId,
      userName: r.userName,
      avatar: r.avatar ?? null,
      liters, // Still showing 6-month total for leaderboard ranking
      prevLiters: lastThirtyOneDaysLiters, // Now showing last 31 days consumption
      changePct, // Change from previous 31 days to last 31 days
    };
  });
}

export async function getMonthlyGrowthRate(): Promise<number | null> {
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

  const lastThirtyOneDaysLiters =
    Math.round(Number(row?.lastThirtyOneDaysLiters ?? 0) * 100) / 100;
  const prevThirtyOneDaysLiters =
    Math.round(Number(row?.prevThirtyOneDaysLiters ?? 0) * 100) / 100;

  const growthRatePct =
    prevThirtyOneDaysLiters > 0
      ? Math.round(
          ((lastThirtyOneDaysLiters - prevThirtyOneDaysLiters) /
            prevThirtyOneDaysLiters) *
            10000
        ) / 100
      : null;

  return growthRatePct;
}

export async function getTotalConsumption(): Promise<number> {
  const total = await db
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

  const totalLiters = total.reduce(
    (sum, row) => sum + (row.totalLiters ?? 0),
    0
  );

  return totalLiters;
}
