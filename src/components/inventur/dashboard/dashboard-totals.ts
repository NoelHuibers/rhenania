import { calculateLostValue, type StockStatusWithDetails } from "../utils";

type TotalsItem = Pick<
	StockStatusWithDetails,
	| "drinkId"
	| "lastInventoryStock"
	| "soldSince"
	| "calculatedStock"
	| "currentPrice"
>;

export type DashboardTotals = {
	totalSoldUnits: number;
	totalPurchasedUnits: number;
	totalLostValue: number;
	totalInventoryValue: number;
};

/**
 * The figures above the stock table, from the shown purchases and "Ist"
 * values. A drink without an entered "Ist" counts with its expected stock,
 * so it adds no loss.
 */
export function dashboardTotals(
	stockItems: readonly TotalsItem[],
	purchases: { [key: string]: number },
	countedStock: { [key: string]: number },
): DashboardTotals {
	const totalSoldUnits = stockItems.reduce((s, i) => s + i.soldSince, 0);
	const totalPurchasedUnits = stockItems.reduce(
		(s, i) => s + (purchases[i.drinkId] || 0),
		0,
	);
	const totalLostValue = stockItems.reduce((s, item) => {
		const p = purchases[item.drinkId] || 0;
		const calc = item.lastInventoryStock + p - item.soldSince;
		const actual = countedStock[item.drinkId] ?? calc;
		return s + calculateLostValue({ ...item, calculatedStock: calc }, actual);
	}, 0);
	const totalInventoryValue = stockItems.reduce((s, item) => {
		const actual = countedStock[item.drinkId] ?? item.calculatedStock;
		return s + actual * item.currentPrice;
	}, 0);
	return {
		totalSoldUnits,
		totalPurchasedUnits,
		totalLostValue,
		totalInventoryValue,
	};
}
