// repo.ts — the drinks in the tenant DB (#33).
//
// Drizzle reads and writes of the drink catalogue, the menu's reads (with
// what was ordered of each drink) and a member's recent drinks. Every
// function takes the database it runs on; none checks the caller, applies
// a rule or revalidates a page. A read that may find nothing returns null
// or []; a failed query throws.

import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { drinks, orders } from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";

export type Drink = typeof drinks.$inferSelect;
export type DrinkInsert = typeof drinks.$inferInsert;

// ─── The catalogue ───────────────────────────────────────────────────────────

/** Every drink, newest first (the Getränkewart page). */
export async function listDrinks(db: TenantDb): Promise<Drink[]> {
	return (
		db
			.select()
			.from(drinks)
			// rowid breaks ties between drinks created in the same second.
			.orderBy(desc(drinks.createdAt), sql`${drinks}.rowid`)
	);
}

export async function drinkById(
	db: TenantDb,
	drinkId: string,
): Promise<Drink | null> {
	const [drink] = await db
		.select()
		.from(drinks)
		.where(eq(drinks.id, drinkId))
		.limit(1);
	return drink ?? null;
}

export async function insertDrink(
	db: TenantDb,
	values: DrinkInsert,
): Promise<Drink | undefined> {
	const [drink] = await db.insert(drinks).values(values).returning();
	return drink;
}

/** The changed drink, or undefined if there is no such drink. */
export async function updateDrink(
	db: TenantDb,
	drinkId: string,
	patch: Partial<DrinkInsert>,
): Promise<Drink | undefined> {
	const [drink] = await db
		.update(drinks)
		.set(patch)
		.where(eq(drinks.id, drinkId))
		.returning();
	return drink;
}

/** Deletes the drink; its picture URL, or undefined if there was none. */
export async function deleteDrink(db: TenantDb, drinkId: string) {
	const [deleted] = await db
		.delete(drinks)
		.where(eq(drinks.id, drinkId))
		.returning({ picture: drinks.picture });
	return deleted;
}

// ─── The menu ────────────────────────────────────────────────────────────────

const menuColumns = {
	id: drinks.id,
	name: drinks.name,
	price: drinks.price,
	kastengroesse: drinks.kastengroesse,
	volume: drinks.volume,
	picture: drinks.picture,
	isCurrentlyAvailable: drinks.isCurrentlyAvailable,
	createdAt: drinks.createdAt,
	updatedAt: drinks.updatedAt,
};

const menuGroup = [
	drinks.id,
	drinks.name,
	drinks.price,
	drinks.kastengroesse,
	drinks.volume,
	drinks.picture,
	drinks.isCurrentlyAvailable,
	drinks.createdAt,
	drinks.updatedAt,
] as const;

const consumed = sql`COALESCE(SUM(${orders.amount}), 0)`;

/** The available drinks, most ordered first. */
export async function availableDrinksByConsumption(db: TenantDb) {
	return db
		.select(menuColumns)
		.from(drinks)
		.leftJoin(orders, eq(drinks.id, orders.drinkId))
		.where(eq(drinks.isCurrentlyAvailable, true))
		.groupBy(...menuGroup)
		.orderBy(desc(consumed));
}

/** Every drink with what was ordered of it, most ordered first. */
export async function drinksByConsumption(db: TenantDb) {
	return db
		.select({
			...menuColumns,
			totalConsumption: sql`COALESCE(SUM(${orders.amount}), 0)`.as(
				"totalConsumption",
			),
		})
		.from(drinks)
		.leftJoin(orders, eq(drinks.id, orders.drinkId))
		.groupBy(...menuGroup)
		.orderBy(desc(consumed));
}

/**
 * Ids of the available drinks `userId` ordered most since `since`, most
 * ordered first, ties by the latest order.
 */
export async function mostOrderedDrinkIds(
	db: TenantDb,
	userId: string,
	since: Date,
	limit: number,
): Promise<string[]> {
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
		.limit(limit);
	return rows.map((r) => r.drinkId);
}
