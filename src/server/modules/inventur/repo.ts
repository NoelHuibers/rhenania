// repo.ts — the Inventur in the tenant DB (#33).
//
// Drizzle reads and writes of inventories and their items, with what they
// read of drinks, orders, events and the CC-Kasse. Every function takes the
// database or the open transaction (`Db`) it runs on; none checks the
// caller, applies a rule or revalidates a page. A read that may find
// nothing returns null or []; a failed query throws.

import "server-only";

import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import {
	drinks,
	etaplans,
	events,
	inventories,
	inventoryItems,
	kostenerstattungen,
	kostenpunkte,
	orders,
} from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";

/** An open transaction on a tenant DB. */
export type Tx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
/** The tenant DB or a transaction on it. */
export type Db = TenantDb | Tx;

export type Inventory = typeof inventories.$inferSelect;
export type InventoryInsert = typeof inventories.$inferInsert;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type InventoryItemInsert = typeof inventoryItems.$inferInsert;
export type Drink = typeof drinks.$inferSelect;

// ─── Inventories ─────────────────────────────────────────────────────────────

/** The running inventory (the latest, if there were several), or null. */
export async function latestActiveInventory(db: Db): Promise<Inventory | null> {
	const [inventory] = await db
		.select()
		.from(inventories)
		.where(eq(inventories.status, "active"))
		.orderBy(desc(inventories.createdAt))
		.limit(1);
	return inventory ?? null;
}

/** When the running inventory started, or null when none runs. */
export async function activeInventoryStart(db: Db): Promise<Date | null> {
	const [active] = await db
		.select({ createdAt: inventories.createdAt })
		.from(inventories)
		.where(eq(inventories.status, "active"))
		.orderBy(desc(inventories.createdAt))
		.limit(1);
	return active?.createdAt ?? null;
}

/** The id of a running inventory, or null. */
export async function activeInventoryId(db: Db): Promise<string | null> {
	const [active] = await db
		.select({ id: inventories.id })
		.from(inventories)
		.where(eq(inventories.status, "active"))
		.limit(1);
	return active?.id ?? null;
}

/** The running Veranstaltungs-Inventur, or null. */
export async function activeEventInventory(db: Db) {
	const [inv] = await db
		.select({
			id: inventories.id,
			eventName: inventories.eventName,
			eventDate: inventories.eventDate,
			startedAt: inventories.createdAt,
		})
		.from(inventories)
		.where(and(eq(inventories.status, "active"), eq(inventories.kind, "event")))
		.limit(1);
	return inv ?? null;
}

/** The latest closed inventories, newest first. */
export async function closedInventories(
	db: Db,
	limit: number,
): Promise<Inventory[]> {
	return db
		.select()
		.from(inventories)
		.where(eq(inventories.status, "closed"))
		.orderBy(desc(inventories.createdAt))
		.limit(limit);
}

/** The loss an inventory was closed with, or null if there is none. */
export async function inventoryLoss(
	db: Db,
	inventoryId: string,
): Promise<number | null> {
	const [closed] = await db
		.select({ totalLoss: inventories.totalLoss })
		.from(inventories)
		.where(eq(inventories.id, inventoryId))
		.limit(1);
	return closed ? closed.totalLoss : null;
}

/** Opens an inventory; the new row. */
export async function insertInventory(
	db: Db,
	values: InventoryInsert,
): Promise<Inventory | undefined> {
	const [inventory] = await db.insert(inventories).values(values).returning();
	return inventory;
}

/** Opens an inventory; its id. */
export async function insertInventoryId(
	db: Db,
	values: InventoryInsert,
): Promise<string | undefined> {
	const [inventory] = await db
		.insert(inventories)
		.values(values)
		.returning({ id: inventories.id });
	return inventory?.id;
}

export async function closeInventory(
	db: Db,
	inventoryId: string,
	closedAt: Date,
	totalLoss: number,
) {
	await db
		.update(inventories)
		.set({ status: "closed", closedAt, totalLoss })
		.where(eq(inventories.id, inventoryId));
}

/** Turns a running Veranstaltungs-Inventur into a routine one. */
export async function demoteActiveEventInventory(db: Db) {
	await db
		.update(inventories)
		.set({ kind: "routine", eventId: null, eventName: null, eventDate: null })
		.where(
			and(eq(inventories.status, "active"), eq(inventories.kind, "event")),
		);
}

// ─── Inventory items ─────────────────────────────────────────────────────────

/** The items of an inventory (one per drink). */
export async function itemsOf(db: Db, inventoryId: string) {
	return db
		.select({
			id: inventoryItems.id,
			drinkId: inventoryItems.drinkId,
			previousStock: inventoryItems.previousStock,
		})
		.from(inventoryItems)
		.where(eq(inventoryItems.inventoryId, inventoryId));
}

/** The inventory's item for one drink, or null. */
export async function itemOfDrink(
	db: Db,
	inventoryId: string,
	drinkId: string,
): Promise<InventoryItem | null> {
	const [item] = await db
		.select()
		.from(inventoryItems)
		.where(
			and(
				eq(inventoryItems.inventoryId, inventoryId),
				eq(inventoryItems.drinkId, drinkId),
			),
		)
		.limit(1);
	return item ?? null;
}

/** The drink's item in the latest inventory that has one, or null. */
export async function latestItemOfDrink(
	db: Db,
	drinkId: string,
): Promise<InventoryItem | null> {
	const [prior] = await db
		.select()
		.from(inventoryItems)
		.innerJoin(inventories, eq(inventoryItems.inventoryId, inventories.id))
		.where(eq(inventoryItems.drinkId, drinkId))
		.orderBy(desc(inventories.createdAt))
		.limit(1);
	return prior?.inventory_item ?? null;
}

/** The drink's count in the latest closed inventory, or null. */
export async function lastClosedCount(db: Db, drinkId: string) {
	const [lastCount] = await db
		.select({
			countedStock: inventoryItems.countedStock,
			closedAt: inventories.closedAt,
			createdAt: inventories.createdAt,
		})
		.from(inventoryItems)
		.innerJoin(inventories, eq(inventoryItems.inventoryId, inventories.id))
		.where(
			and(
				eq(inventoryItems.drinkId, drinkId),
				eq(inventories.status, "closed"),
			),
		)
		.orderBy(desc(inventories.createdAt))
		.limit(1);
	return lastCount ?? null;
}

export async function insertItem(db: Db, values: InventoryItemInsert) {
	await db.insert(inventoryItems).values(values);
}

export async function insertItems(db: Db, values: InventoryItemInsert[]) {
	await db.insert(inventoryItems).values(values);
}

export async function updateItem(
	db: Db,
	itemId: string,
	patch: Partial<InventoryItemInsert>,
) {
	await db
		.update(inventoryItems)
		.set(patch)
		.where(eq(inventoryItems.id, itemId));
}

export async function updateItemOfDrink(
	db: Db,
	inventoryId: string,
	drinkId: string,
	patch: Partial<InventoryItemInsert>,
) {
	await db
		.update(inventoryItems)
		.set(patch)
		.where(
			and(
				eq(inventoryItems.inventoryId, inventoryId),
				eq(inventoryItems.drinkId, drinkId),
			),
		);
}

// ─── Drinks and orders ───────────────────────────────────────────────────────

export async function allDrinks(db: Db): Promise<Drink[]> {
	return db.select().from(drinks);
}

export async function drinkById(
	db: Db,
	drinkId: string,
): Promise<Drink | null> {
	const [drink] = await db
		.select()
		.from(drinks)
		.where(eq(drinks.id, drinkId))
		.limit(1);
	return drink ?? null;
}

export async function drinksByIds(
	db: Db,
	drinkIds: string[],
): Promise<Drink[]> {
	return db.select().from(drinks).where(inArray(drinks.id, drinkIds));
}

/** Units of each of the drinks ordered since `since`. */
export async function soldSinceByDrink(
	db: Db,
	drinkIds: string[],
	since: Date,
) {
	return db
		.select({
			drinkId: orders.drinkId,
			total: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
		})
		.from(orders)
		.where(and(inArray(orders.drinkId, drinkIds), gte(orders.createdAt, since)))
		.groupBy(orders.drinkId);
}

/** Units of one drink ordered since `since`. */
export async function soldSince(
	db: Db,
	drinkId: string,
	since: Date,
): Promise<number> {
	const [soldAgg] = await db
		.select({ total: sql<number>`COALESCE(SUM(${orders.amount}), 0)` })
		.from(orders)
		.where(and(eq(orders.drinkId, drinkId), gte(orders.createdAt, since)));
	return Number(soldAgg?.total || 0);
}

// ─── The stock overview and the history ──────────────────────────────────────

/**
 * Each available drink, and per drink its latest inventory item (by the
 * inventory's start) with what was sold since. Two queries, one round trip.
 */
export async function stockRows(db: TenantDb) {
	// Latest inventory item per drink, ranked by the inventory's start.
	const ranked = db
		.select({
			drinkId: inventoryItems.drinkId,
			previousStock: inventoryItems.previousStock,
			purchasedSince: inventoryItems.purchasedSince,
			countedStock: inventoryItems.countedStock,
			isCounted: inventoryItems.isCounted,
			inventoryCreatedAt: sql<number>`${inventories.createdAt}`.as(
				"inventory_created_at",
			),
			rank: sql<number>`row_number() over (partition by ${inventoryItems.drinkId} order by ${inventories.createdAt} desc)`.as(
				"rank",
			),
		})
		.from(inventoryItems)
		.innerJoin(inventories, eq(inventoryItems.inventoryId, inventories.id))
		.where(
			inArray(
				inventoryItems.drinkId,
				db
					.select({ id: drinks.id })
					.from(drinks)
					.where(eq(drinks.isCurrentlyAvailable, true)),
			),
		)
		.as("ranked");

	const [available, latest] = await db.batch([
		db.select().from(drinks).where(eq(drinks.isCurrentlyAvailable, true)),
		db
			.select({
				drinkId: ranked.drinkId,
				previousStock: ranked.previousStock,
				purchasedSince: ranked.purchasedSince,
				countedStock: ranked.countedStock,
				isCounted: ranked.isCounted,
				inventoryCreatedAt: ranked.inventoryCreatedAt,
				soldSince: sql<number>`coalesce(sum(${orders.amount}), 0)`,
			})
			.from(ranked)
			// Orders of that drink since its latest count.
			.leftJoin(
				orders,
				sql`${orders.drinkId} = "ranked"."drinkId" and ${orders.createdAt} >= "ranked"."inventory_created_at"`,
			)
			.where(eq(ranked.rank, 1))
			.groupBy(sql`"ranked"."drinkId"`),
	]);
	return { available, latest };
}

// Markup profit (feature `drinks.markup`): what members paid on top of the
// purchase price, for every order that recorded its `costPerUnit`.
function markupProfitQuery(db: TenantDb, from: Date | null, to: Date | null) {
	return db
		.select({
			profit: sql<number>`COALESCE(SUM(${orders.amount} * (${orders.pricePerUnit} - ${orders.costPerUnit})), 0)`,
		})
		.from(orders)
		.where(
			and(
				isNotNull(orders.costPerUnit),
				from ? gte(orders.createdAt, from) : undefined,
				to ? lt(orders.createdAt, to) : undefined,
			),
		);
}

const profitOf = (rows: Array<{ profit: number }>) =>
	Number(rows[0]?.profit ?? 0);

/** The markup profit of the orders from `from` to `to` (open ends: null). */
export async function markupProfit(
	db: TenantDb,
	from: Date | null,
	to: Date | null,
): Promise<number> {
	return profitOf(await markupProfitQuery(db, from, to));
}

/**
 * The items of the given inventories with their drink's name, in the order
 * they were stored, and (`withProfits`) each inventory's markup profit:
 * one round trip.
 */
export async function historyItems(
	db: TenantDb,
	periods: Inventory[],
	withProfits: boolean,
) {
	const itemsQuery = db
		.select({
			inventoryItem: inventoryItems,
			drinkName: drinks.name,
		})
		.from(inventoryItems)
		.innerJoin(drinks, eq(inventoryItems.drinkId, drinks.id))
		.where(
			inArray(
				inventoryItems.inventoryId,
				periods.map((inv) => inv.id),
			),
		)
		.orderBy(sql`${inventoryItems}.rowid`);
	if (!withProfits) {
		return { items: await itemsQuery, profits: null };
	}
	// The same profit query as for the running inventory, once per period.
	const [items, ...profits] = await db.batch([
		itemsQuery,
		...periods.map((inv) => markupProfitQuery(db, inv.createdAt, inv.closedAt)),
	]);
	return { items, profits: profits.map(profitOf) };
}

// ─── Events and the CC-Kasse ─────────────────────────────────────────────────

/** Events since `since`, newest first, at most 50. */
export async function eventsSince(db: TenantDb, since: Date) {
	return db
		.select({ id: events.id, title: events.title, date: events.date })
		.from(events)
		.where(gte(events.date, since))
		.orderBy(desc(events.date))
		.limit(50);
}

/** Every Etatplan, newest first. */
export async function listEtaplans(db: TenantDb) {
	return db
		.select({ id: etaplans.id, name: etaplans.name, status: etaplans.status })
		.from(etaplans)
		.orderBy(desc(etaplans.createdAt));
}

/** Every Kostenpunkt with its Etatplan. */
export async function listKostenpunkte(db: TenantDb) {
	return db
		.select({
			id: kostenpunkte.id,
			etaplanId: kostenpunkte.etaplanId,
			name: kostenpunkte.name,
			category: kostenpunkte.category,
		})
		.from(kostenpunkte);
}

/** The Kostenpunkt and its Etatplan, or null. */
export async function kostenpunkt(db: Db, kostenpunktId: string) {
	const [kp] = await db
		.select({ id: kostenpunkte.id, etaplanId: kostenpunkte.etaplanId })
		.from(kostenpunkte)
		.where(eq(kostenpunkte.id, kostenpunktId))
		.limit(1);
	return kp ?? null;
}

export async function insertKostenerstattung(
	db: Db,
	values: typeof kostenerstattungen.$inferInsert,
) {
	await db.insert(kostenerstattungen).values(values);
}
