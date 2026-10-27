// loss.ts — expected stock and inventory loss of one drink.
//
// One definition for the stock overview, the inventory history, closing an
// inventory and finishing a Veranstaltungs-Inventur: the stock expected
// since the last count, and what a count below it is worth at the
// purchase price.

import { roundToCent } from "~/lib/money";

export type StockMovement = {
	/** The opening stock of the period (the last count). */
	previousStock: number;
	/** Bought since. */
	purchasedSince: number;
	/** Ordered since. */
	soldSince: number;
};

/**
 * Opening stock + purchases − sales, never below 0: more sales than stock
 * (a missed purchase) leave nothing expected rather than a negative stock.
 */
export function expectedStock({
	previousStock,
	purchasedSince,
	soldSince,
}: StockMovement): number {
	return Math.max(0, previousStock + purchasedSince - soldSince);
}

/**
 * The units missing from `counted` and their value at `price`, rounded to
 * whole cents. A count at or above the expected stock is no loss (and no
 * gain).
 */
export function itemLoss(
	item: StockMovement & { counted: number; price: number },
): { missing: number; value: number } {
	const missing = Math.max(0, expectedStock(item) - item.counted);
	return {
		missing,
		value: missing > 0 ? roundToCent(missing * item.price) : 0,
	};
}
