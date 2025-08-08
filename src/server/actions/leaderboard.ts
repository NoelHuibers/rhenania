"use server";

import { desc, eq, gte, sql } from "drizzle-orm";
import { db } from "~/server/db/index";
import { drinks, orders, users } from "~/server/db/schema";

export type LeaderboardEntry = {
  userId: string;
  userName: string;
  avatar: string | null;
  liters: number;
};

export async function getLeaderboardLast6Months({
  limit = 10,
}: { limit?: number } = {}): Promise<LeaderboardEntry[]> {
  const sixMonthsAgo = sql<number>`unixepoch('now','-6 months')`;

  const rows = await db
    .select({
      userId: orders.userId,
      userName: orders.userName,
      avatar: users.image,
      liters: sql<number>`SUM(CASE WHEN ${drinks.volume} IS NOT NULL THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`,
    })
    .from(orders)
    .leftJoin(drinks, eq(orders.drinkId, drinks.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .where(gte(orders.createdAt, sixMonthsAgo))
    .groupBy(orders.userId, orders.userName, users.image)
    .orderBy(
      desc(
        sql`SUM(CASE WHEN ${drinks.volume} IS NOT NULL THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`
      )
    )
    .limit(limit);

  return rows.map((r) => ({
    userId: r.userId,
    userName: r.userName,
    avatar: r.avatar ?? null,
    liters: Math.round(((r.liters ?? 0) as number) * 100) / 100,
  }));
}
