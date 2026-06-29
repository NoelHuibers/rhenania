// server/actions/inventur/inventur.ts
"use server";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
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

const round2 = (n: number) => Math.round(n * 100) / 100;

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
	items: Array<{
		drinkId: string;
		drinkName: string;
		countedStock: number;
		expectedStock: number;
		difference: number;
		lossValue: number;
	}>;
};

export async function getStockData(): Promise<StockStatusWithDetails[]> {
	const allDrinks = await db
		.select()
		.from(drinks)
		.where(eq(drinks.isCurrentlyAvailable, true));

	const stockData = await Promise.all(
		allDrinks.map(async (drink) => {
			const lastInventoryItem = await db
				.select()
				.from(inventoryItems)
				.innerJoin(inventories, eq(inventoryItems.inventoryId, inventories.id))
				.where(eq(inventoryItems.drinkId, drink.id))
				.orderBy(desc(inventories.createdAt))
				.limit(1);

			if (!lastInventoryItem[0]) {
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

			const inventoryItem = lastInventoryItem[0].inventory_item;
			const lastInventoryDate = lastInventoryItem[0].inventory.createdAt;

			const soldSinceDrizzle = await db
				.select({
					totalamount: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
				})
				.from(orders)
				.where(
					and(
						eq(orders.drinkId, drink.id),
						gte(orders.createdAt, lastInventoryDate),
					),
				);

			const soldCount = Number(soldSinceDrizzle[0]?.totalamount || 0);

			return {
				drinkId: drink.id,
				drinkName: drink.name,
				lastInventoryStock: inventoryItem.previousStock,
				purchasedSince: inventoryItem.purchasedSince,
				soldSince: soldCount,
				calculatedStock: Math.max(
					0,
					inventoryItem.previousStock +
						inventoryItem.purchasedSince -
						soldCount,
				),
				countedStock: inventoryItem.countedStock,
				currentPrice: drink.price,
				lastInventoryDate,
			};
		}),
	);

	return stockData;
}

export async function getInventoryHistory(): Promise<InventoryWithItems[]> {
	const inventoriesData = await db
		.select()
		.from(inventories)
		.where(eq(inventories.status, "closed"))
		.orderBy(desc(inventories.createdAt))
		.limit(10);

	const historyWithItems = await Promise.all(
		inventoriesData.map(async (inv) => {
			const items = await db
				.select({
					inventoryItem: inventoryItems,
					drinkName: drinks.name,
				})
				.from(inventoryItems)
				.innerJoin(drinks, eq(inventoryItems.drinkId, drinks.id))
				.where(eq(inventoryItems.inventoryId, inv.id));

			const itemsWithDetails = items.map((item) => {
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
			});

			return {
				id: inv.id,
				inventoryDate: inv.closedAt ?? inv.createdAt,
				status: inv.status,
				totalLosses: inv.totalLoss,
				kind: inv.kind,
				eventName: inv.eventName,
				eventDate: inv.eventDate,
				items: itemsWithDetails,
			};
		}),
	);

	return historyWithItems;
}

export async function saveInventoryCount(
	items: Array<{
		drinkId: string;
		countedStock: number;
		purchasedSince: number;
	}>,
	opts?: { startEvent?: EventInfo },
) {
	const session = await auth();
	if (!session?.user) {
		return { success: false, error: "Unauthorized" };
	}

	let totalInventoryLoss = 0;

	try {
		await db.transaction(async (tx) => {
			const lastActive = await tx
				.select()
				.from(inventories)
				.where(eq(inventories.status, "active"))
				.orderBy(desc(inventories.createdAt))
				.limit(1);

			const activeInv = lastActive[0] ?? null;

			if (activeInv) {
				for (const item of items) {
					const validatedCountedStock = Math.max(0, item.countedStock);
					const validatedPurchasedSince = Math.max(0, item.purchasedSince);

					const drink = await tx
						.select()
						.from(drinks)
						.where(eq(drinks.id, item.drinkId))
						.limit(1);

					if (!drink[0]) continue;

					const soldSinceAgg = await tx
						.select({
							total: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
						})
						.from(orders)
						.where(
							and(
								eq(orders.drinkId, item.drinkId),
								gte(orders.createdAt, activeInv.createdAt),
							),
						);

					const soldSinceFinal = Number(soldSinceAgg[0]?.total || 0);

					const existingActiveItem = await tx
						.select()
						.from(inventoryItems)
						.where(
							and(
								eq(inventoryItems.inventoryId, activeInv.id),
								eq(inventoryItems.drinkId, item.drinkId),
							),
						)
						.limit(1);

					let itemLoss = 0;
					if (existingActiveItem[0]) {
						const expectedStock = Math.max(
							0,
							existingActiveItem[0].previousStock +
								validatedPurchasedSince -
								soldSinceFinal,
						);
						const difference = validatedCountedStock - expectedStock;
						if (difference < 0) {
							itemLoss = Math.abs(difference) * drink[0].price;
						}
						totalInventoryLoss += itemLoss;

						await tx
							.update(inventoryItems)
							.set({
								countedStock: validatedCountedStock,
								purchasedSince: validatedPurchasedSince,
								soldSince: soldSinceFinal,
								lossValue: itemLoss,
							})
							.where(eq(inventoryItems.id, existingActiveItem[0].id));
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
							itemLoss = Math.abs(difference) * drink[0].price;
						}
						totalInventoryLoss += itemLoss;

						await tx.insert(inventoryItems).values({
							inventoryId: activeInv.id,
							drinkId: item.drinkId,
							previousStock: Math.max(0, baselinePreviousStock),
							countedStock: validatedCountedStock,
							purchasedSince: validatedPurchasedSince,
							soldSince: soldSinceFinal,
							priceAtCount: drink[0].price,
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

			for (const item of items) {
				const drink = await tx
					.select()
					.from(drinks)
					.where(eq(drinks.id, item.drinkId))
					.limit(1);

				if (!drink[0]) continue;

				let closingCounted: number | null = null;

				if (activeInv) {
					const justClosedItem = await tx
						.select()
						.from(inventoryItems)
						.where(
							and(
								eq(inventoryItems.inventoryId, activeInv.id),
								eq(inventoryItems.drinkId, item.drinkId),
							),
						)
						.limit(1);

					if (justClosedItem[0])
						closingCounted = justClosedItem[0].countedStock;
				}

				if (closingCounted === null) {
					const latestAny = await tx
						.select()
						.from(inventoryItems)
						.innerJoin(
							inventories,
							eq(inventoryItems.inventoryId, inventories.id),
						)
						.where(eq(inventoryItems.drinkId, item.drinkId))
						.orderBy(desc(inventories.createdAt))
						.limit(1);

					closingCounted = latestAny[0]?.inventory_item.countedStock ?? 0;
				}

				const validatedCountedStock = Math.max(0, item.countedStock);

				await tx.insert(inventoryItems).values({
					inventoryId: newInventory.id,
					drinkId: item.drinkId,
					previousStock: validatedCountedStock,
					countedStock: validatedCountedStock,
					purchasedSince: 0,
					soldSince: 0,
					priceAtCount: drink[0].price,
					lossValue: 0,
				});
			}
		});

		return { success: true, totalInventoryLoss: totalInventoryLoss };
	} catch (error) {
		console.error("Failed to save inventory:", error);
		return {
			success: false,
			error:
				error instanceof Error ? error.message : "Failed to save inventory",
		};
	}
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
			const activeInventory = await tx
				.select()
				.from(inventories)
				.where(eq(inventories.status, "active"))
				.limit(1);

			if (!activeInventory[0]) {
				const [newInventory] = await tx
					.insert(inventories)
					.values({
						status: "active",
						performedBy: session.user.id,
						totalLoss: 0,
					})
					.returning();

				if (!newInventory) {
					throw new Error("Failed to create inventory");
				}

				const allDrinks = await tx.select().from(drinks);
				for (const drink of allDrinks) {
					await tx.insert(inventoryItems).values({
						inventoryId: newInventory.id,
						drinkId: drink.id,
						countedStock: 0,
						previousStock: 0,
						purchasedSince: 0,
						soldSince: 0,
						priceAtCount: drink.price,
						lossValue: 0,
					});
				}
			}

			const currentInventoryId = activeInventory[0]?.id;

			if (!currentInventoryId) {
				throw new Error("No active inventory found");
			}

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
				error instanceof Error ? error.message : "Failed to save adjustments",
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
	if (!session?.user) return { success: false as const, error: "Unauthorized" };
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
	if (!session?.user) return { success: false, error: "Unauthorized" };

	try {
		const report = await db.transaction(async (tx) => {
			const [activeInv] = await tx
				.select()
				.from(inventories)
				.where(eq(inventories.status, "active"))
				.orderBy(desc(inventories.createdAt))
				.limit(1);

			if (!activeInv) throw new Error("Keine aktive Inventur vorhanden");
			if (activeInv.kind !== "event")
				throw new Error("Die aktive Inventur ist keine Veranstaltung");

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
				if (!drink) continue;

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
				const value = round2(consumed * drink.price);
				totalQty += consumed;
				totalValue = round2(totalValue + value);
				if (consumed > 0)
					reportItems.push({ drinkName: drink.name, consumed, value });

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
			if (!newInv)
				throw new Error("Folge-Inventur konnte nicht angelegt werden");

			for (const item of items) {
				const [drink] = await tx
					.select()
					.from(drinks)
					.where(eq(drinks.id, item.drinkId))
					.limit(1);
				if (!drink) continue;
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
