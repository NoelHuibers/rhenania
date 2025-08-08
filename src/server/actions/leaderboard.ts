"use server";

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
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

export async function getLeaderboardLast6Months({
  limit = 10,
}: { limit?: number } = {}): Promise<LeaderboardEntry[]> {
  const sixMonthsAgo = sql<number>`unixepoch('now','-6 months')`;
  const twelveMonthsAgo = sql<number>`unixepoch('now','-12 months')`;

  // Aggregation für das vorherige 6‑Monats‑Fenster pro Nutzer
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
        gte(orders.createdAt, twelveMonthsAgo),
        lt(orders.createdAt, sixMonthsAgo)
      )
    )
    .groupBy(orders.userId)
    .as("prevByUser");

  // Aktuelles 6‑Monats‑Fenster + Join auf vorheriges Fenster
  const rows = await db
    .select({
      userId: orders.userId,
      userName: orders.userName,
      avatar: users.image,
      liters:
        sql<number>`SUM(CASE WHEN ${drinks.volume} IS NOT NULL THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`.as(
          "liters"
        ),
      prevLiters: prevByUser.prevLiters,
    })
    .from(orders)
    .leftJoin(drinks, eq(orders.drinkId, drinks.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .leftJoin(prevByUser, eq(prevByUser.userId, orders.userId))
    .where(gte(orders.createdAt, sixMonthsAgo))
    .groupBy(orders.userId, orders.userName, users.image)
    .orderBy(
      desc(
        sql`SUM(CASE WHEN ${drinks.volume} IS NOT NULL THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`
      )
    )
    .limit(limit);

  return rows.map((r) => {
    const liters = Math.round(((r.liters ?? 0) as number) * 100) / 100;
    const prevLiters = Math.round(((r.prevLiters ?? 0) as number) * 100) / 100;

    const changePct =
      prevLiters > 0
        ? Math.round(((liters - prevLiters) / prevLiters) * 10000) / 100
        : null; // 2 Nachkommastellen

    return {
      userId: r.userId,
      userName: r.userName,
      avatar: r.avatar ?? null,
      liters,
      prevLiters,
      changePct,
    };
  });
}

export async function getMonthlyGrowthRate(): Promise<number | null> {
  const thisMonthStart = sql<number>`unixepoch(date('now','start of month','localtime'))`;
  const lastMonthStart = sql<number>`unixepoch(date('now','start of month','-1 month','localtime'))`;
  const prevMonthStart = sql<number>`unixepoch(date('now','start of month','-2 months','localtime'))`;

  const [row] = await db
    .select({
      lastMonthLiters: sql<number>`
        SUM(
          CASE WHEN ${orders.createdAt} >= ${lastMonthStart}
                 AND ${orders.createdAt} < ${thisMonthStart}
                 AND ${drinks.volume} IS NOT NULL
               THEN ${orders.amount} * ${drinks.volume}
               ELSE 0
          END
        )
      `.as("lastMonthLiters"),
      prevMonthLiters: sql<number>`
        SUM(
          CASE WHEN ${orders.createdAt} >= ${prevMonthStart}
                 AND ${orders.createdAt} < ${lastMonthStart}
                 AND ${drinks.volume} IS NOT NULL
               THEN ${orders.amount} * ${drinks.volume}
               ELSE 0
          END
        )
      `.as("prevMonthLiters"),
    })
    .from(orders)
    .leftJoin(drinks, eq(orders.drinkId, drinks.id));

  const lastMonthLiters =
    Math.round(Number(row?.lastMonthLiters ?? 0) * 100) / 100;
  const prevMonthLiters =
    Math.round(Number(row?.prevMonthLiters ?? 0) * 100) / 100;

  const growthRatePct =
    prevMonthLiters > 0
      ? Math.round(
          ((lastMonthLiters - prevMonthLiters) / prevMonthLiters) * 10000
        ) / 100
      : null;

  return growthRatePct;
}
