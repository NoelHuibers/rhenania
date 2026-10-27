// utils.ts
import type { StatusStyle } from "~/lib/status";

export type StockStatusWithDetails = {
	drinkId: string;
	drinkName: string;
	lastInventoryStock: number;
	purchasedSince: number;
	soldSince: number;
	calculatedStock: number;
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

export function calculateLostValue(
	item: { calculatedStock: number; currentPrice: number },
	actualStock: number,
): number {
	const lost = item.calculatedStock - actualStock;
	return lost > 0 ? lost * item.currentPrice : 0;
}

export type StockStatus = StatusStyle & { label: string };

/**
 * Counted vs. expected stock as a label and a status style; the severity of a
 * loss goes from a warning tint to a solid red.
 */
export function getStockStatus(
	item: { calculatedStock: number },
	actualStock: number,
): StockStatus {
	const difference = actualStock - item.calculatedStock;

	// Handle impossible negative stock (surplus when calculated stock is negative)
	if (item.calculatedStock < 0 && actualStock >= 0) {
		return { label: "Überschuss", tone: "info" };
	}

	// Perfect match
	if (difference === 0) {
		return { label: "OK", tone: "success" };
	}

	// Surplus (more than expected)
	if (difference > 0) {
		return { label: "Überschuss", tone: "info" };
	}

	// Calculate loss percentage for better categorization
	// Only calculate if we have a positive expected stock
	if (item.calculatedStock > 0) {
		const lossPercentage = (Math.abs(difference) / item.calculatedStock) * 100;

		// Minor loss (up to 5%)
		if (lossPercentage <= 5) {
			return { label: "Toleranz", tone: "warning" };
		}

		// Moderate loss (5-15%)
		if (lossPercentage <= 15) {
			return { label: "Warnung", tone: "warning", strong: true };
		}

		// Significant loss (15-30%)
		if (lossPercentage <= 30) {
			return { label: "Verlust", tone: "danger" };
		}

		// Critical loss (>30%)
		return { label: "Kritisch", tone: "danger", strong: true };
	}

	// Fallback for edge cases (e.g., calculated stock is 0 but we have losses)
	return { label: "Verlust", tone: "danger" };
}
