import type { StockStatusWithDetails } from "./utils";

type StockItem = Pick<
	StockStatusWithDetails,
	"drinkId" | "drinkName" | "calculatedStock" | "purchasedSince"
>;

export type CountState = {
	/** The "Ist" value shown per drink (pre-filled, not necessarily counted). */
	countedStock: Readonly<Record<string, number>>;
	purchases: Readonly<Record<string, number>>;
	/** Drinks whose "Ist" the user actually entered. */
	countedIds: ReadonlySet<string>;
};

/** The rows sent for a full or event inventory: every drink, as shown. */
export function buildInventoryCount(
	stockItems: readonly StockItem[],
	{ countedStock, purchases }: Pick<CountState, "countedStock" | "purchases">,
) {
	return stockItems.map((item) => ({
		drinkId: item.drinkId,
		countedStock: countedStock[item.drinkId] ?? item.calculatedStock,
		purchasedSince: purchases[item.drinkId] || 0,
	}));
}

/** Drinks nobody counted: their "Ist" is only the pre-filled value. */
export function findUncountedDrinks<T extends StockItem>(
	stockItems: readonly T[],
	countedIds: ReadonlySet<string>,
): T[] {
	return stockItems.filter((item) => !countedIds.has(item.drinkId));
}

/**
 * Quick adjustments for the changed drinks. A count is only sent for drinks
 * the user counted, so changing a purchase never stores the pre-filled "Ist"
 * as if it had been counted.
 */
export function buildQuickAdjustments(
	changedIds: Iterable<string>,
	stockItems: readonly StockItem[],
	{ countedStock, purchases, countedIds }: CountState,
) {
	const adjustments: Array<{
		drinkId: string;
		countedStock?: number;
		purchasedQuantity?: number;
	}> = [];
	for (const drinkId of changedIds) {
		const item = stockItems.find((i) => i.drinkId === drinkId);
		const purchaseValue = purchases[drinkId] || 0;
		const purchaseChanged = (item?.purchasedSince || 0) !== purchaseValue;
		const count = countedIds.has(drinkId) ? countedStock[drinkId] : undefined;
		if (count === undefined && !purchaseChanged) {
			continue;
		}
		adjustments.push({
			drinkId,
			countedStock: count,
			purchasedQuantity: purchaseChanged ? purchaseValue : undefined,
		});
	}
	return adjustments;
}

/**
 * A full inventory with uncounted drinks needs an explicit confirmation, so
 * they are never silently saved as if counted.
 */
export function isBlockedByUncounted(
	uncounted: readonly unknown[],
	accepted: boolean,
): boolean {
	return uncounted.length > 0 && !accepted;
}
