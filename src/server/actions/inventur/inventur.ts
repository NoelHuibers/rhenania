// server/actions/inventur/inventur.ts
"use server";

import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { addMoney, roundToCent } from "~/lib/money";
import { createNewBilling } from "~/server/actions/billings/billings";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
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
import { hasFeature } from "~/server/lib/features";

export type EventInfo = {
	eventId?: string | null;
	eventName: string;
	eventDate?: Date | null;
};

export type StockStatusWithDetails = {
	drinkId: string;
	drinkName: string;
	lastInventoryStock: number;
	purchasedSince: number;
	soldSince: number;
	calculatedStock: number;
	currentPrice: number;
	lastInventoryDate: Date | null;
};

export type InventoryWithItems = {
	id: string;
	inventoryDate: Date;
	status: string;
	totalLosses: number;
	kind: "routine" | "event";
	eventName: string | null;
	eventDate: Date | null;
	/** Markup profit earned during this inventory period; null without the feature. */
	profit: number | null;
	items: Array<{
		drinkId: string;
		drinkName: string;
		countedStock: number;
		expectedStock: number;
		difference: number;
		lossValue: number;
	}>;
};

// ─── Markup profit (feature `drinks.markup`) ──────────────────────────────────
//
// Profit is what members paid on top of the purchase price: for every order
// that recorded its `costPerUnit`, amount × (pricePerUnit − costPerUnit).
// Stock value and losses keep being valued at the purchase price.

function markupProfitQuery(from: Date | null, to: Date | null) {
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

type ProfitRows = Array<{ profit: number }>;

function markupProfitOf(rows: ProfitRows) {
	return roundToCent(Number(rows[0]?.profit ?? 0));
}

async function sumMarkupProfit(from: Date | null, to: Date | null) {
	return markupProfitOf(await markupProfitQuery(from, to));
}

/**
 * Markup profit since the running inventory started (all time if there is
 * none yet). Returns null for tenants without the markup feature.
 */
export async function getInventoryProfit(): Promise<number | null> {
	if (!(await hasFeature("drinks.markup"))) {
		return null;
	}

	const [active] = await db
		.select({ createdAt: inventories.createdAt })
		.from(inventories)
		.where(eq(inventories.status, "active"))
		.orderBy(desc(inventories.createdAt))
		.limit(1);

	return sumMarkupProfit(active?.createdAt ?? null, null);
}

/**
 * Each available drink's latest count (running or closed inventory) and what
 * was sold since. Two queries in one round trip, however many drinks.
 */
export async function getStockData(): Promise<StockStatusWithDetails[]> {
	// Latest inventory item per drink, ranked by the inventory's start.
	const ranked = db
		.select({
			drinkId: inventoryItems.drinkId,
			previousStock: inventoryItems.previousStock,
			purchasedSince: inventoryItems.purchasedSince,
			countedStock: inventoryItems.countedStock,
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

	const [allDrinks, latest] = await db.batch([
		db.select().from(drinks).where(eq(drinks.isCurrentlyAvailable, true)),
		db
			.select({
				drinkId: ranked.drinkId,
				previousStock: ranked.previousStock,
				purchasedSince: ranked.purchasedSince,
				countedStock: ranked.countedStock,
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
	const latestByDrink = new Map(latest.map((l) => [l.drinkId, l]));

	return allDrinks.map((drink) => {
		const item = latestByDrink.get(drink.id);
		if (!item) {
			return {
				drinkId: drink.id,
				drinkName: drink.name,
				lastInventoryStock: 0,
				purchasedSince: 0,
				soldSince: 0,
				calculatedStock: 0,
				currentPrice: drink.price,
				lastInventoryDate: null,
			};
		}

		const soldCount = Number(item.soldSince || 0);
		return {
			drinkId: drink.id,
			drinkName: drink.name,
			lastInventoryStock: item.previousStock,
			purchasedSince: item.purchasedSince,
			soldSince: soldCount,
			calculatedStock: Math.max(
				0,
				item.previousStock + item.purchasedSince - soldCount,
			),
			countedStock: item.countedStock,
			currentPrice: drink.price,
			// Timestamps are stored in seconds.
			lastInventoryDate: new Date(item.inventoryCreatedAt * 1000),
		};
	});
}

/**
 * The last ten closed inventories with their items and, with the markup
 * feature, each period's profit. Constant round trips, however many.
 */
export async function getInventoryHistory(): Promise<InventoryWithItems[]> {
	const markupEnabled = await hasFeature("drinks.markup");
	const inventoriesData = await db
		.select()
		.from(inventories)
		.where(eq(inventories.status, "closed"))
		.orderBy(desc(inventories.createdAt))
		.limit(10);
	if (inventoriesData.length === 0) {
		return [];
	}

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
				inventoriesData.map((inv) => inv.id),
			),
		)
		.orderBy(sql`${inventoryItems}.rowid`);
	// The same profit query as getInventoryProfit, once per period, batched.
	const [items, ...profits] = markupEnabled
		? await db.batch([
				itemsQuery,
				...inventoriesData.map((inv) =>
					markupProfitQuery(inv.createdAt, inv.closedAt),
				),
			])
		: [await itemsQuery];

	const itemsByInventory = new Map<string, typeof items>();
	for (const item of items) {
		const list = itemsByInventory.get(item.inventoryItem.inventoryId) ?? [];
		list.push(item);
		itemsByInventory.set(item.inventoryItem.inventoryId, list);
	}

	return inventoriesData.map((inv, i) => {
		const itemsWithDetails = (itemsByInventory.get(inv.id) ?? []).map(
			(item) => {
				const expectedStock = Math.max(
					0,
					item.inventoryItem.previousStock +
						item.inventoryItem.purchasedSince -
						item.inventoryItem.soldSince,
				);

				const difference = item.inventoryItem.countedStock - expectedStock;

				return {
					drinkId: item.inventoryItem.drinkId,
					drinkName: item.drinkName,
					countedStock: item.inventoryItem.countedStock,
					expectedStock,
					difference,
					lossValue: item.inventoryItem.lossValue,
				};
			},
		);

		const profitRows = profits[i] as ProfitRows | undefined;
		return {
			id: inv.id,
			inventoryDate: inv.closedAt ?? inv.createdAt,
			status: inv.status,
			totalLosses: inv.totalLoss,
			kind: inv.kind,
			eventName: inv.eventName,
			eventDate: inv.eventDate,
			profit: profitRows ? markupProfitOf(profitRows) : null,
			items: itemsWithDetails,
		};
	});
}

export type InventoryCountItem = {
	drinkId: string;
	countedStock: number;
	purchasedSince: number;
};

export async function saveInventoryCount(
	items: InventoryCountItem[],
	opts?: { startEvent?: EventInfo },
) {
	const result = await countInventory(items, opts);
	if (!result.success) {
		return { success: false, error: result.error };
	}
	return { success: true, totalInventoryLoss: result.totalInventoryLoss };
}

/**
 * Closes the running inventory with the given counts and opens the next one.
 * Also reports which inventory was closed (null for the very first count).
 */
async function countInventory(
	items: InventoryCountItem[],
	opts?: { startEvent?: EventInfo },
): Promise<
	| {
			success: true;
			totalInventoryLoss: number;
			closedInventoryId: string | null;
	  }
	| { success: false; error: string }
> {
	const session = await auth();
	if (!session?.user) {
		return { success: false, error: "Unauthorized" };
	}

	let totalInventoryLoss = 0;
	let closedInventoryId: string | null = null;

	try {
		await db.transaction(async (tx) => {
			const lastActive = await tx
				.select()
				.from(inventories)
				.where(eq(inventories.status, "active"))
				.orderBy(desc(inventories.createdAt))
				.limit(1);

			const activeInv = lastActive[0] ?? null;

			// Drinks and sales since the running inventory, read once for all
			// items instead of once per drink.
			const drinkIds = [...new Set(items.map((item) => item.drinkId))];
			const drinksById = new Map(
				(drinkIds.length > 0
					? await tx.select().from(drinks).where(inArray(drinks.id, drinkIds))
					: []
				).map((d) => [d.id, d]),
			);

			if (activeInv) {
				const soldByDrink = new Map(
					(drinkIds.length > 0
						? await tx
								.select({
									drinkId: orders.drinkId,
									total: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
								})
								.from(orders)
								.where(
									and(
										inArray(orders.drinkId, drinkIds),
										gte(orders.createdAt, activeInv.createdAt),
									),
								)
								.groupBy(orders.drinkId)
						: []
					).map((r) => [r.drinkId, r.total]),
				);
				// The running inventory's item per drink (unique per drink).
				const activeItems = new Map(
					(
						await tx
							.select({
								id: inventoryItems.id,
								drinkId: inventoryItems.drinkId,
								previousStock: inventoryItems.previousStock,
							})
							.from(inventoryItems)
							.where(eq(inventoryItems.inventoryId, activeInv.id))
					).map((row) => [row.drinkId, row]),
				);

				for (const item of items) {
					const validatedCountedStock = Math.max(0, item.countedStock);
					const validatedPurchasedSince = Math.max(0, item.purchasedSince);

					const drink = drinksById.get(item.drinkId);
					if (!drink) {
						continue;
					}

					const soldSinceFinal = Number(soldByDrink.get(item.drinkId) || 0);

					const existing = activeItems.get(item.drinkId);

					let itemLoss = 0;
					if (existing) {
						const expectedStock = Math.max(
							0,
							existing.previousStock + validatedPurchasedSince - soldSinceFinal,
						);
						const difference = validatedCountedStock - expectedStock;
						if (difference < 0) {
							itemLoss = roundToCent(Math.abs(difference) * drink.price);
						}
						totalInventoryLoss = addMoney(totalInventoryLoss, itemLoss);

						await tx
							.update(inventoryItems)
							.set({
								countedStock: validatedCountedStock,
								purchasedSince: validatedPurchasedSince,
								soldSince: soldSinceFinal,
								lossValue: itemLoss,
							})
							.where(eq(inventoryItems.id, existing.id));
					} else {
						const priorForBaseline = await tx
							.select()
							.from(inventoryItems)
							.innerJoin(
								inventories,
								eq(inventoryItems.inventoryId, inventories.id),
							)
							.where(eq(inventoryItems.drinkId, item.drinkId))
							.orderBy(desc(inventories.createdAt))
							.limit(1);

						const baselinePreviousStock =
							priorForBaseline[0]?.inventory_item.countedStock ?? 0;

						const expectedStock = Math.max(
							0,
							baselinePreviousStock + validatedPurchasedSince - soldSinceFinal,
						);
						const difference = validatedCountedStock - expectedStock;
						if (difference < 0) {
							itemLoss = roundToCent(Math.abs(difference) * drink.price);
						}
						totalInventoryLoss = addMoney(totalInventoryLoss, itemLoss);

						await tx.insert(inventoryItems).values({
							inventoryId: activeInv.id,
							drinkId: item.drinkId,
							previousStock: Math.max(0, baselinePreviousStock),
							countedStock: validatedCountedStock,
							purchasedSince: validatedPurchasedSince,
							soldSince: soldSinceFinal,
							priceAtCount: drink.price,
							lossValue: itemLoss,
						});
					}
				}

				await tx
					.update(inventories)
					.set({
						status: "closed",
						closedAt: new Date(),
						totalLoss: totalInventoryLoss,
					})
					.where(eq(inventories.id, activeInv.id));
				closedInventoryId = activeInv.id;
			}

			const [newInventory] = await tx
				.insert(inventories)
				.values({
					status: "active",
					performedBy: session.user.id,
					totalLoss: 0,
					kind: opts?.startEvent ? "event" : "routine",
					eventId: opts?.startEvent?.eventId ?? null,
					eventName: opts?.startEvent?.eventName ?? null,
					eventDate: opts?.startEvent?.eventDate ?? null,
				})
				.returning();

			if (!newInventory) {
				throw new Error("Failed to create inventory");
			}

			// Each counted stock is the opening stock of the next inventory.
			const openingItems = items.flatMap((item) => {
				const drink = drinksById.get(item.drinkId);
				if (!drink) {
					return [];
				}
				const validatedCountedStock = Math.max(0, item.countedStock);
				return [
					{
						inventoryId: newInventory.id,
						drinkId: item.drinkId,
						previousStock: validatedCountedStock,
						countedStock: validatedCountedStock,
						purchasedSince: 0,
						soldSince: 0,
						priceAtCount: drink.price,
						lossValue: 0,
					},
				];
			});
			if (openingItems.length > 0) {
				await tx.insert(inventoryItems).values(openingItems);
			}
		});

		return { success: true, totalInventoryLoss, closedInventoryId };
	} catch (error) {
		console.error("Failed to save inventory:", error);
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to save inventory",
		};
	}
}

export type CloseInventoryAndBillResult =
	| {
			success: true;
			totalInventoryLoss: number;
			billsCreated: number;
			message: string;
	  }
	| { success: false; failedStep: "inventory"; error: string }
	| {
			success: false;
			failedStep: "billing";
			totalInventoryLoss: number;
			error: string;
	  };

/**
 * "Inventur + Rechnung": closes the running inventory and then starts a
 * billing run. The Umlage is the loss of the inventory just closed, read from
 * the database — never a value sent by the browser. Billing only runs when
 * the inventory was saved, and a billing failure is reported as such.
 */
export async function closeInventoryAndBill(
	items: InventoryCountItem[],
): Promise<CloseInventoryAndBillResult> {
	const counted = await countInventory(items);
	if (!counted.success) {
		return { success: false, failedStep: "inventory", error: counted.error };
	}

	let totalInventoryLoss = 0;
	if (counted.closedInventoryId) {
		const [closed] = await db
			.select({ totalLoss: inventories.totalLoss })
			.from(inventories)
			.where(eq(inventories.id, counted.closedInventoryId))
			.limit(1);
		totalInventoryLoss = closed?.totalLoss ?? 0;
	}

	let billingError: string | null = null;
	let billsCreated = 0;
	let message = "";
	try {
		const billing = await createNewBilling(totalInventoryLoss);
		if (billing.success) {
			billsCreated =
				billing.billsCreated +
				("eventBillsCreated" in billing ? billing.eventBillsCreated : 0);
			message = billing.message;
		} else {
			billingError =
				"error" in billing && billing.error ? billing.error : billing.message;
		}
	} catch (error) {
		console.error("Billing after inventory failed:", error);
		billingError =
			error instanceof Error ? error.message : "Unbekannter Fehler";
	}

	if (billingError !== null) {
		const unbilledLoss =
			totalInventoryLoss > 0
				? ` Der Inventurverlust von €${totalInventoryLoss.toFixed(2)} wurde nicht abgerechnet.`
				: "";
		return {
			success: false,
			failedStep: "billing",
			totalInventoryLoss,
			error: `Inventur gespeichert, aber die Rechnung ist fehlgeschlagen: ${billingError}.${unbilledLoss}`,
		};
	}

	return { success: true, totalInventoryLoss, billsCreated, message };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Opens a routine inventory when none is running. Each drink's baseline is
 * the stock it should have right now: its latest closed count minus what was
 * sold since that count. Drinks never counted start at 0.
 */
async function openInventoryWithBaselines(
	tx: Tx,
	performedBy: string,
): Promise<string> {
	const [newInventory] = await tx
		.insert(inventories)
		.values({ status: "active", performedBy, totalLoss: 0 })
		.returning({ id: inventories.id });

	if (!newInventory) {
		throw new Error("Inventur konnte nicht angelegt werden");
	}

	const allDrinks = await tx.select().from(drinks);
	for (const drink of allDrinks) {
		const [lastCount] = await tx
			.select({
				countedStock: inventoryItems.countedStock,
				closedAt: inventories.closedAt,
				createdAt: inventories.createdAt,
			})
			.from(inventoryItems)
			.innerJoin(inventories, eq(inventoryItems.inventoryId, inventories.id))
			.where(
				and(
					eq(inventoryItems.drinkId, drink.id),
					eq(inventories.status, "closed"),
				),
			)
			.orderBy(desc(inventories.createdAt))
			.limit(1);

		let baseline = 0;
		if (lastCount) {
			const [soldAgg] = await tx
				.select({ total: sql<number>`COALESCE(SUM(${orders.amount}), 0)` })
				.from(orders)
				.where(
					and(
						eq(orders.drinkId, drink.id),
						gte(orders.createdAt, lastCount.closedAt ?? lastCount.createdAt),
					),
				);
			baseline = Math.max(
				0,
				lastCount.countedStock - Number(soldAgg?.total ?? 0),
			);
		}

		await tx.insert(inventoryItems).values({
			inventoryId: newInventory.id,
			drinkId: drink.id,
			countedStock: baseline,
			previousStock: baseline,
			purchasedSince: 0,
			soldSince: 0,
			priceAtCount: drink.price,
			lossValue: 0,
		});
	}

	return newInventory.id;
}

export async function saveQuickAdjustments(
	adjustments: Array<{
		drinkId: string;
		countedStock?: number;
		purchasedQuantity?: number;
	}>,
) {
	const session = await auth();
	if (!session?.user) {
		return { success: false, error: "Unauthorized" };
	}

	try {
		await db.transaction(async (tx) => {
			const [activeInventory] = await tx
				.select({ id: inventories.id })
				.from(inventories)
				.where(eq(inventories.status, "active"))
				.limit(1);

			const currentInventoryId =
				activeInventory?.id ??
				(await openInventoryWithBaselines(tx, session.user.id));

			for (const adjustment of adjustments) {
				if (
					adjustment.countedStock === undefined &&
					adjustment.purchasedQuantity === undefined
				) {
					continue;
				}

				const currentItem = await tx
					.select()
					.from(inventoryItems)
					.where(
						and(
							eq(inventoryItems.inventoryId, currentInventoryId),
							eq(inventoryItems.drinkId, adjustment.drinkId),
						),
					)
					.limit(1);

				if (!currentItem[0]) {
					const drink = await tx
						.select()
						.from(drinks)
						.where(eq(drinks.id, adjustment.drinkId))
						.limit(1);

					if (drink[0]) {
						await tx.insert(inventoryItems).values({
							inventoryId: currentInventoryId,
							drinkId: adjustment.drinkId,
							countedStock: Math.max(0, adjustment.countedStock || 0),
							previousStock: 0,
							purchasedSince: Math.max(0, adjustment.purchasedQuantity || 0),
							soldSince: 0,
							priceAtCount: drink[0].price,
							lossValue: 0,
						});
					}
				} else {
					// biome-ignore lint/suspicious/noExplicitAny: partial update object built dynamically
					const updates: any = {};
					if (adjustment.countedStock !== undefined) {
						updates.countedStock = Math.max(0, adjustment.countedStock);
					}
					if (adjustment.purchasedQuantity !== undefined) {
						updates.purchasedSince = Math.max(0, adjustment.purchasedQuantity);
					}

					if (Object.keys(updates).length > 0) {
						await tx
							.update(inventoryItems)
							.set(updates)
							.where(
								and(
									eq(inventoryItems.inventoryId, currentInventoryId),
									eq(inventoryItems.drinkId, adjustment.drinkId),
								),
							);
					}
				}
			}
		});

		return { success: true };
	} catch (error) {
		console.error("Failed to save adjustments:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Änderungen konnten nicht gespeichert werden",
		};
	}
}

// ─── Veranstaltungs-Inventur (before/after an event) ──────────────────────────

export async function getActiveEventInventory() {
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

export type ActiveEventInventory = Awaited<
	ReturnType<typeof getActiveEventInventory>
>;

export async function listInventurEvents() {
	const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
	return db
		.select({ id: events.id, title: events.title, date: events.date })
		.from(events)
		.where(gte(events.date, since))
		.orderBy(desc(events.date))
		.limit(50);
}

export type InventurEvent = Awaited<
	ReturnType<typeof listInventurEvents>
>[number];

export async function listEtaplansWithKostenpunkte() {
	const [plans, kps] = await Promise.all([
		db
			.select({ id: etaplans.id, name: etaplans.name, status: etaplans.status })
			.from(etaplans)
			.orderBy(desc(etaplans.createdAt)),
		db
			.select({
				id: kostenpunkte.id,
				etaplanId: kostenpunkte.etaplanId,
				name: kostenpunkte.name,
				category: kostenpunkte.category,
			})
			.from(kostenpunkte),
	]);
	return plans.map((p) => ({
		...p,
		kostenpunkte: kps.filter((k) => k.etaplanId === p.id),
	}));
}

export type EtaplanWithKostenpunkte = Awaited<
	ReturnType<typeof listEtaplansWithKostenpunkte>
>[number];

export async function cancelEventInventory() {
	const session = await auth();
	if (!session?.user) {
		return { success: false as const, error: "Unauthorized" };
	}
	await db
		.update(inventories)
		.set({ kind: "routine", eventId: null, eventName: null, eventDate: null })
		.where(
			and(eq(inventories.status, "active"), eq(inventories.kind, "event")),
		);
	revalidatePath("/getraenkewart");
	return { success: true as const };
}

export type EventConsumptionReport = {
	eventName: string | null;
	eventDate: Date | null;
	items: Array<{ drinkName: string; consumed: number; value: number }>;
	totalQty: number;
	totalValue: number;
	booked: boolean;
};

export async function finishEventInventory(
	items: Array<{
		drinkId: string;
		countedStock: number;
		purchasedSince: number;
	}>,
	opts: { kostenpunktId?: string | null } = {},
): Promise<
	| { success: true; report: EventConsumptionReport }
	| { success: false; error: string }
> {
	const session = await auth();
	if (!session?.user) {
		return { success: false, error: "Unauthorized" };
	}

	try {
		const report = await db.transaction(async (tx) => {
			const [activeInv] = await tx
				.select()
				.from(inventories)
				.where(eq(inventories.status, "active"))
				.orderBy(desc(inventories.createdAt))
				.limit(1);

			if (!activeInv) {
				throw new Error("Keine aktive Inventur vorhanden");
			}
			if (activeInv.kind !== "event") {
				throw new Error("Die aktive Inventur ist keine Veranstaltung");
			}

			const reportItems: EventConsumptionReport["items"] = [];
			let totalQty = 0;
			let totalValue = 0;

			for (const item of items) {
				const counted = Math.max(0, item.countedStock);
				const purchased = Math.max(0, item.purchasedSince);

				const [drink] = await tx
					.select()
					.from(drinks)
					.where(eq(drinks.id, item.drinkId))
					.limit(1);
				if (!drink) {
					continue;
				}

				const [soldAgg] = await tx
					.select({ total: sql<number>`COALESCE(SUM(${orders.amount}), 0)` })
					.from(orders)
					.where(
						and(
							eq(orders.drinkId, item.drinkId),
							gte(orders.createdAt, activeInv.createdAt),
						),
					);
				const sold = Number(soldAgg?.total || 0);

				const [existing] = await tx
					.select()
					.from(inventoryItems)
					.where(
						and(
							eq(inventoryItems.inventoryId, activeInv.id),
							eq(inventoryItems.drinkId, item.drinkId),
						),
					)
					.limit(1);

				let previousStock = existing?.previousStock ?? 0;
				if (!existing) {
					const [prior] = await tx
						.select()
						.from(inventoryItems)
						.innerJoin(
							inventories,
							eq(inventoryItems.inventoryId, inventories.id),
						)
						.where(eq(inventoryItems.drinkId, item.drinkId))
						.orderBy(desc(inventories.createdAt))
						.limit(1);
					previousStock = prior?.inventory_item.countedStock ?? 0;
				}

				const expected = Math.max(0, previousStock + purchased - sold);
				const consumed = Math.max(0, expected - counted);
				const value = roundToCent(consumed * drink.price);
				totalQty += consumed;
				totalValue = roundToCent(totalValue + value);
				if (consumed > 0) {
					reportItems.push({ drinkName: drink.name, consumed, value });
				}

				if (existing) {
					await tx
						.update(inventoryItems)
						.set({
							countedStock: counted,
							purchasedSince: purchased,
							soldSince: sold,
							lossValue: value,
						})
						.where(eq(inventoryItems.id, existing.id));
				} else {
					await tx.insert(inventoryItems).values({
						inventoryId: activeInv.id,
						drinkId: item.drinkId,
						previousStock: Math.max(0, previousStock),
						countedStock: counted,
						purchasedSince: purchased,
						soldSince: sold,
						priceAtCount: drink.price,
						lossValue: value,
					});
				}
			}

			await tx
				.update(inventories)
				.set({ status: "closed", closedAt: new Date(), totalLoss: totalValue })
				.where(eq(inventories.id, activeInv.id));

			// Open the next routine inventory with the Endbestand as baseline.
			const [newInv] = await tx
				.insert(inventories)
				.values({
					status: "active",
					performedBy: session.user.id,
					totalLoss: 0,
				})
				.returning();
			if (!newInv) {
				throw new Error("Folge-Inventur konnte nicht angelegt werden");
			}

			for (const item of items) {
				const [drink] = await tx
					.select()
					.from(drinks)
					.where(eq(drinks.id, item.drinkId))
					.limit(1);
				if (!drink) {
					continue;
				}
				const counted = Math.max(0, item.countedStock);
				await tx.insert(inventoryItems).values({
					inventoryId: newInv.id,
					drinkId: item.drinkId,
					previousStock: counted,
					countedStock: counted,
					purchasedSince: 0,
					soldSince: 0,
					priceAtCount: drink.price,
					lossValue: 0,
				});
			}

			// Optionally book the consumption value to CC-Kasse as a direct expense.
			let booked = false;
			if (opts.kostenpunktId && totalValue > 0) {
				const [kp] = await tx
					.select({ id: kostenpunkte.id, etaplanId: kostenpunkte.etaplanId })
					.from(kostenpunkte)
					.where(eq(kostenpunkte.id, opts.kostenpunktId))
					.limit(1);
				if (kp) {
					const when = activeInv.eventDate ?? new Date();
					await tx.insert(kostenerstattungen).values({
						kostenpunktId: kp.id,
						etaplanId: kp.etaplanId,
						source: "Direktbuchung",
						status: "Ausgezahlt",
						description: `Getränkeverbrauch – ${activeInv.eventName ?? "Veranstaltung"}`,
						amount: totalValue,
						submittedBy: null,
						recipientName: "Getränkekasse",
						expenseDate: when,
						approvedBy: session.user.id,
						approvedAt: when,
						paidBy: session.user.id,
						paidAt: when,
					});
					booked = true;
				}
			}

			return {
				eventName: activeInv.eventName,
				eventDate: activeInv.eventDate,
				items: reportItems,
				totalQty,
				totalValue,
				booked,
			} satisfies EventConsumptionReport;
		});

		revalidatePath("/getraenkewart");
		revalidatePath("/cc-kasse");
		return { success: true, report };
	} catch (error) {
		console.error("Failed to finish event inventory:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Veranstaltungs-Inventur fehlgeschlagen",
		};
	}
}
