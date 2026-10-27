// recent-drinks.ts — the "Zuletzt bestellt" shortcuts on /trinken (#74).
//
// A member mostly orders the same few drinks, so the menu offers them first:
// the drinks this member ordered most in the last 30 days that can be
// ordered right now. Server-only (not a server action): the user id comes
// from the page's session, never from the client.

import { and, desc, eq, gte, sql } from "drizzle-orm";

import { RECENT_DRINKS_LIMIT } from "~/lib/drink-order";
import { db } from "~/server/db";
import { drinks, orders } from "~/server/db/schema";

export const RECENT_DRINKS_DAYS = 30;

/** Ids of the member's most ordered available drinks, most ordered first. */
export async function getRecentDrinkIds(
	userId: string,
	options: { now?: Date; days?: number; limit?: number } = {},
): Promise<string[]> {
	const now = options.now ?? new Date();
	const days = options.days ?? RECENT_DRINKS_DAYS;
	const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
	const total = sql<number>`SUM(${orders.amount})`;
	const rows = await db
		.select({ drinkId: orders.drinkId })
		.from(orders)
		.innerJoin(drinks, eq(drinks.id, orders.drinkId))
		.where(
			and(
				eq(orders.userId, userId),
				gte(orders.createdAt, since),
				eq(drinks.isCurrentlyAvailable, true),
			),
		)
		.groupBy(orders.drinkId)
		.orderBy(desc(total), desc(sql`MAX(${orders.createdAt})`))
		.limit(options.limit ?? RECENT_DRINKS_LIMIT);
	return rows.map((r) => r.drinkId);
}
