// service.ts — the Inventur: the stock overview, counting and closing an
// inventory, quick saves, the history with the markup profit and the
// Veranstaltungs-Inventur (#33).
//
// Domain rules on top of ./repo. Every function takes the TenantScope it
// works in; failures the user should read are DomainErrors, anything else
// (a failed query) propagates. Expected stock and losses come from
// domain/inventory/loss.ts. Counting runs in one transaction.

import "server-only";

import { z } from "zod";
import { addMoney, roundToCent } from "~/lib/money";
import { expectedStock, itemLoss } from "~/server/domain/inventory/loss";
import { ActionError } from "~/server/lib/define-action";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

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
	/**
	 * The "Ist" counted for the latest inventory (a quick save in the running
	 * one); absent while the drink is not counted.
	 */
	countedStock?: number;
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

export type InventoryCountItem = {
	drinkId: string;
	countedStock: number;
	purchasedSince: number;
};

export type EventConsumptionReport = {
	eventName: string | null;
	eventDate: Date | null;
	items: Array<{ drinkName: string; consumed: number; value: number }>;
	totalQty: number;
	totalValue: number;
	booked: boolean;
};

// Negative counts are clamped to 0 when stored; NaN, Infinity and fractions
// are rejected outright.
const NOT_WHOLE = "Bestände müssen ganze Zahlen sein";
const wholeStock = z.number({ error: NOT_WHOLE }).int(NOT_WHOLE);
export const countItemsSchema = z.array(
	z.object({
		drinkId: z.string(),
		countedStock: wholeStock,
		purchasedSince: wholeStock,
	}),
);
export const eventInfoSchema = z.object({
	eventId: z.string().nullish(),
	eventName: z.string(),
	eventDate: z.date().nullish(),
});
export const quickAdjustmentsSchema = z.array(
	z.object({
		drinkId: z.string(),
		countedStock: z.number().optional(),
		purchasedQuantity: z.number().optional(),
	}),
);

// ─── Markup profit (feature `drinks.markup`) ─────────────────────────────────
//
// Profit is what members paid on top of the purchase price: for every order
// that recorded its `costPerUnit`, amount × (pricePerUnit − costPerUnit).
// Stock value and losses keep being valued at the purchase price.

/** Markup profit since the running inventory started (all time if none). */
export async function runningProfit({ db }: TenantScope): Promise<number> {
	const start = await repo.activeInventoryStart(db);
	return roundToCent(await repo.markupProfit(db, start, null));
}

// ─── The stock overview ──────────────────────────────────────────────────────

/**
 * Each available drink's latest count (running or closed inventory) and what
 * was sold since. Two queries in one round trip, however many drinks.
 */
export async function stock({
	db,
}: TenantScope): Promise<StockStatusWithDetails[]> {
	const { available, latest } = await repo.stockRows(db);
	const latestByDrink = new Map(latest.map((l) => [l.drinkId, l]));

	return available.map((drink) => {
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
			calculatedStock: expectedStock({
				previousStock: item.previousStock,
				purchasedSince: item.purchasedSince,
				soldSince: soldCount,
			}),
			// Opening rows and purchase-only quick saves hold no count (#221).
			countedStock: item.isCounted ? item.countedStock : undefined,
			currentPrice: drink.price,
			// Timestamps are stored in seconds.
			lastInventoryDate: new Date(item.inventoryCreatedAt * 1000),
		};
	});
}

// ─── The history ─────────────────────────────────────────────────────────────

/**
 * The last ten closed inventories with their items and, with the markup
 * feature, each period's profit. Constant round trips, however many.
 */
export async function history(
	{ db }: TenantScope,
	markupEnabled: boolean,
): Promise<InventoryWithItems[]> {
	const periods = await repo.closedInventories(db, 10);
	if (periods.length === 0) {
		return [];
	}
	const { items, profits } = await repo.historyItems(
		db,
		periods,
		markupEnabled,
	);

	const itemsByInventory = new Map<string, typeof items>();
	for (const item of items) {
		const list = itemsByInventory.get(item.inventoryItem.inventoryId) ?? [];
		list.push(item);
		itemsByInventory.set(item.inventoryItem.inventoryId, list);
	}

	return periods.map((inv, i) => {
		const itemsWithDetails = (itemsByInventory.get(inv.id) ?? []).map(
			(item) => {
				const expected = expectedStock(item.inventoryItem);
				const difference = item.inventoryItem.countedStock - expected;
				return {
					drinkId: item.inventoryItem.drinkId,
					drinkName: item.drinkName,
					countedStock: item.inventoryItem.countedStock,
					expectedStock: expected,
					difference,
					lossValue: item.inventoryItem.lossValue,
				};
			},
		);

		const profit = profits?.[i];
		return {
			id: inv.id,
			inventoryDate: inv.closedAt ?? inv.createdAt,
			status: inv.status,
			totalLosses: inv.totalLoss,
			kind: inv.kind,
			eventName: inv.eventName,
			eventDate: inv.eventDate,
			profit: profit !== undefined ? roundToCent(profit) : null,
			items: itemsWithDetails,
		};
	});
}

// ─── Counting ────────────────────────────────────────────────────────────────

/**
 * Closes the running inventory with the given counts and opens the next one.
 * Also reports which inventory was closed (null for the very first count).
 */
export async function countInventory(
	tenant: TenantScope,
	items: InventoryCountItem[],
	performedBy: string,
	opts?: { startEvent?: EventInfo },
): Promise<{ totalInventoryLoss: number; closedInventoryId: string | null }> {
	let totalInventoryLoss = 0;
	let closedInventoryId: string | null = null;

	await tenant.db.transaction(async (tx) => {
		const activeInv = await repo.latestActiveInventory(tx);

		// Drinks and sales since the running inventory, read once for all
		// items instead of once per drink.
		const drinkIds = [...new Set(items.map((item) => item.drinkId))];
		const drinksById = new Map(
			(drinkIds.length > 0 ? await repo.drinksByIds(tx, drinkIds) : []).map(
				(d) => [d.id, d],
			),
		);

		if (activeInv) {
			const soldByDrink = new Map(
				(drinkIds.length > 0
					? await repo.soldSinceByDrink(tx, drinkIds, activeInv.createdAt)
					: []
				).map((r) => [r.drinkId, r.total]),
			);
			// The running inventory's item per drink (unique per drink).
			const activeItems = new Map(
				(await repo.itemsOf(tx, activeInv.id)).map((row) => [row.drinkId, row]),
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

				if (existing) {
					const loss = itemLoss({
						previousStock: existing.previousStock,
						purchasedSince: validatedPurchasedSince,
						soldSince: soldSinceFinal,
						counted: validatedCountedStock,
						price: drink.price,
					}).value;
					totalInventoryLoss = addMoney(totalInventoryLoss, loss);

					await repo.updateItem(tx, existing.id, {
						countedStock: validatedCountedStock,
						isCounted: true,
						purchasedSince: validatedPurchasedSince,
						soldSince: soldSinceFinal,
						lossValue: loss,
					});
				} else {
					const prior = await repo.latestItemOfDrink(tx, item.drinkId);
					const baselinePreviousStock = prior?.countedStock ?? 0;

					const loss = itemLoss({
						previousStock: baselinePreviousStock,
						purchasedSince: validatedPurchasedSince,
						soldSince: soldSinceFinal,
						counted: validatedCountedStock,
						price: drink.price,
					}).value;
					totalInventoryLoss = addMoney(totalInventoryLoss, loss);

					await repo.insertItem(tx, {
						inventoryId: activeInv.id,
						drinkId: item.drinkId,
						previousStock: Math.max(0, baselinePreviousStock),
						countedStock: validatedCountedStock,
						isCounted: true,
						purchasedSince: validatedPurchasedSince,
						soldSince: soldSinceFinal,
						priceAtCount: drink.price,
						lossValue: loss,
					});
				}
			}

			await repo.closeInventory(
				tx,
				activeInv.id,
				tenant.now(),
				totalInventoryLoss,
			);
			closedInventoryId = activeInv.id;
		}

		const newInventory = await repo.insertInventory(tx, {
			status: "active",
			performedBy,
			totalLoss: 0,
			kind: opts?.startEvent ? "event" : "routine",
			eventId: opts?.startEvent?.eventId ?? null,
			eventName: opts?.startEvent?.eventName ?? null,
			eventDate: opts?.startEvent?.eventDate ?? null,
		});
		if (!newInventory) {
			throw new Error("Failed to create inventory");
		}

		// Each counted stock is the opening stock of the next inventory, not
		// yet a count of it.
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
					isCounted: false,
					purchasedSince: 0,
					soldSince: 0,
					priceAtCount: drink.price,
					lossValue: 0,
				},
			];
		});
		if (openingItems.length > 0) {
			await repo.insertItems(tx, openingItems);
		}
	});

	return { totalInventoryLoss, closedInventoryId };
}

/** The loss the inventory was closed with; 0 when there is none. */
export async function closedLoss(
	{ db }: TenantScope,
	inventoryId: string | null,
): Promise<number> {
	if (!inventoryId) {
		return 0;
	}
	return (await repo.inventoryLoss(db, inventoryId)) ?? 0;
}

/**
 * Opens a routine inventory when none is running. Each drink's baseline is
 * the stock it should have right now: its latest closed count minus what was
 * sold since that count. Drinks never counted start at 0.
 */
async function openInventoryWithBaselines(
	tx: repo.Tx,
	performedBy: string,
): Promise<string> {
	const newInventoryId = await repo.insertInventoryId(tx, {
		status: "active",
		performedBy,
		totalLoss: 0,
	});
	if (!newInventoryId) {
		throw new Error("Inventur konnte nicht angelegt werden");
	}

	for (const drink of await repo.allDrinks(tx)) {
		const lastCount = await repo.lastClosedCount(tx, drink.id);
		let baseline = 0;
		if (lastCount) {
			const sold = await repo.soldSince(
				tx,
				drink.id,
				lastCount.closedAt ?? lastCount.createdAt,
			);
			baseline = Math.max(0, lastCount.countedStock - sold);
		}

		await repo.insertItem(tx, {
			inventoryId: newInventoryId,
			drinkId: drink.id,
			countedStock: baseline,
			isCounted: false,
			previousStock: baseline,
			purchasedSince: 0,
			soldSince: 0,
			priceAtCount: drink.price,
			lossValue: 0,
		});
	}

	return newInventoryId;
}

/**
 * Stores counts and purchases in the running inventory without closing it,
 * opening one first when none runs.
 */
export async function saveQuickAdjustments(
	tenant: TenantScope,
	adjustments: z.output<typeof quickAdjustmentsSchema>,
	performedBy: string,
) {
	await tenant.db.transaction(async (tx) => {
		const currentInventoryId =
			(await repo.activeInventoryId(tx)) ??
			(await openInventoryWithBaselines(tx, performedBy));

		for (const adjustment of adjustments) {
			if (
				adjustment.countedStock === undefined &&
				adjustment.purchasedQuantity === undefined
			) {
				continue;
			}

			const currentItem = await repo.itemOfDrink(
				tx,
				currentInventoryId,
				adjustment.drinkId,
			);

			if (!currentItem) {
				const drink = await repo.drinkById(tx, adjustment.drinkId);
				if (drink) {
					await repo.insertItem(tx, {
						inventoryId: currentInventoryId,
						drinkId: adjustment.drinkId,
						countedStock: Math.max(0, adjustment.countedStock ?? 0),
						// Purchases alone are no count (#221).
						isCounted: adjustment.countedStock !== undefined,
						previousStock: 0,
						purchasedSince: Math.max(0, adjustment.purchasedQuantity || 0),
						soldSince: 0,
						priceAtCount: drink.price,
						lossValue: 0,
					});
				}
			} else {
				const updates: Partial<repo.InventoryItemInsert> = {};
				if (adjustment.countedStock !== undefined) {
					updates.countedStock = Math.max(0, adjustment.countedStock);
					updates.isCounted = true;
				}
				if (adjustment.purchasedQuantity !== undefined) {
					updates.purchasedSince = Math.max(0, adjustment.purchasedQuantity);
				}

				if (Object.keys(updates).length > 0) {
					await repo.updateItemOfDrink(
						tx,
						currentInventoryId,
						adjustment.drinkId,
						updates,
					);
				}
			}
		}
	});
}

// ─── Veranstaltungs-Inventur (before/after an event) ─────────────────────────

/** The running Veranstaltungs-Inventur, or null. */
export function activeEventInventory({ db }: TenantScope) {
	return repo.activeEventInventory(db);
}

/** The events of the last 60 days and the coming ones, newest first. */
export function recentEvents(tenant: TenantScope) {
	const since = new Date(tenant.now().getTime() - 60 * 24 * 60 * 60 * 1000);
	return repo.eventsSince(tenant.db, since);
}

/** Every Etatplan with its Kostenpunkte (to book an event's consumption). */
export async function etaplansWithKostenpunkte({ db }: TenantScope) {
	const [plans, kps] = await Promise.all([
		repo.listEtaplans(db),
		repo.listKostenpunkte(db),
	]);
	return plans.map((p) => ({
		...p,
		kostenpunkte: kps.filter((k) => k.etaplanId === p.id),
	}));
}

/** Turns the running Veranstaltungs-Inventur into a routine inventory. */
export async function cancelEventInventory({ db }: TenantScope) {
	await repo.demoteActiveEventInventory(db);
}

/**
 * Closes the running Veranstaltungs-Inventur with the given counts, reports
 * what was consumed and opens the next routine inventory with the counts as
 * its baseline. With a Kostenpunkt, the consumption's value is booked on the
 * CC-Kasse as a paid Direktbuchung.
 */
export async function finishEventInventory(
	tenant: TenantScope,
	user: { id: string },
	items: InventoryCountItem[],
	opts: { kostenpunktId?: string | null },
): Promise<EventConsumptionReport> {
	return tenant.db.transaction(async (tx) => {
		const activeInv = await repo.latestActiveInventory(tx);
		if (!activeInv) {
			throw new ActionError("Keine aktive Inventur vorhanden", "NOT_FOUND");
		}
		if (activeInv.kind !== "event") {
			throw new ActionError(
				"Die aktive Inventur ist keine Veranstaltung",
				"NOT_AN_EVENT",
			);
		}

		const reportItems: EventConsumptionReport["items"] = [];
		let totalQty = 0;
		let totalValue = 0;

		for (const item of items) {
			const counted = Math.max(0, item.countedStock);
			const purchased = Math.max(0, item.purchasedSince);

			const drink = await repo.drinkById(tx, item.drinkId);
			if (!drink) {
				continue;
			}

			const sold = await repo.soldSince(tx, item.drinkId, activeInv.createdAt);
			const existing = await repo.itemOfDrink(tx, activeInv.id, item.drinkId);

			let previousStock = existing?.previousStock ?? 0;
			if (!existing) {
				const prior = await repo.latestItemOfDrink(tx, item.drinkId);
				previousStock = prior?.countedStock ?? 0;
			}

			const { missing: consumed, value } = itemLoss({
				previousStock,
				purchasedSince: purchased,
				soldSince: sold,
				counted,
				price: drink.price,
			});
			totalQty += consumed;
			totalValue = roundToCent(totalValue + value);
			if (consumed > 0) {
				reportItems.push({ drinkName: drink.name, consumed, value });
			}

			if (existing) {
				await repo.updateItem(tx, existing.id, {
					countedStock: counted,
					isCounted: true,
					purchasedSince: purchased,
					soldSince: sold,
					lossValue: value,
				});
			} else {
				await repo.insertItem(tx, {
					inventoryId: activeInv.id,
					drinkId: item.drinkId,
					previousStock: Math.max(0, previousStock),
					countedStock: counted,
					isCounted: true,
					purchasedSince: purchased,
					soldSince: sold,
					priceAtCount: drink.price,
					lossValue: value,
				});
			}
		}

		await repo.closeInventory(tx, activeInv.id, tenant.now(), totalValue);

		// Open the next routine inventory with the Endbestand as baseline.
		const newInv = await repo.insertInventory(tx, {
			status: "active",
			performedBy: user.id,
			totalLoss: 0,
		});
		if (!newInv) {
			throw new Error("Folge-Inventur konnte nicht angelegt werden");
		}

		for (const item of items) {
			const drink = await repo.drinkById(tx, item.drinkId);
			if (!drink) {
				continue;
			}
			const counted = Math.max(0, item.countedStock);
			await repo.insertItem(tx, {
				inventoryId: newInv.id,
				drinkId: item.drinkId,
				previousStock: counted,
				countedStock: counted,
				isCounted: false,
				purchasedSince: 0,
				soldSince: 0,
				priceAtCount: drink.price,
				lossValue: 0,
			});
		}

		// Optionally book the consumption value to CC-Kasse as a direct expense.
		let booked = false;
		if (opts.kostenpunktId && totalValue > 0) {
			const kp = await repo.kostenpunkt(tx, opts.kostenpunktId);
			if (kp) {
				const when = activeInv.eventDate ?? tenant.now();
				await repo.insertKostenerstattung(tx, {
					kostenpunktId: kp.id,
					etaplanId: kp.etaplanId,
					source: "Direktbuchung",
					status: "Ausgezahlt",
					description: `Getränkeverbrauch – ${activeInv.eventName ?? "Veranstaltung"}`,
					amount: totalValue,
					submittedBy: null,
					recipientName: "Getränkekasse",
					expenseDate: when,
					approvedBy: user.id,
					approvedAt: when,
					paidBy: user.id,
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
}
