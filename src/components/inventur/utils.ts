// utils.ts
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
  items: Array<{
    drinkId: string;
    drinkName: string;
    countedStock: number;
    expectedStock: number;
    difference: number;
    lossValue: number;
  }>;
};

export function calculateLostStock(
  item: { calculatedStock: number },
  actualStock: number
): number {
  return item.calculatedStock - actualStock;
}

export function calculateLostValue(
  item: { calculatedStock: number; currentPrice: number },
  actualStock: number
): number {
  const lost = item.calculatedStock - actualStock;
  return lost > 0 ? lost * item.currentPrice : 0;
}

export function getStockStatus(
  item: { calculatedStock: number },
  actualStock: number
) {
  const difference = actualStock - item.calculatedStock;

  // Handle impossible negative stock (surplus when calculated stock is negative)
  if (item.calculatedStock < 0 && actualStock >= 0) {
    return { label: "Überschuss", color: "bg-blue-500" };
  }

  // Perfect match
  if (difference === 0) {
    return { label: "OK", color: "bg-green-500" };
  }

  // Surplus (more than expected)
  if (difference > 0) {
    return { label: "Überschuss", color: "bg-blue-500" };
  }

  // Calculate loss percentage for better categorization
  // Only calculate if we have a positive expected stock
  if (item.calculatedStock > 0) {
    const lossPercentage = (Math.abs(difference) / item.calculatedStock) * 100;

    // Minor loss (up to 5%)
    if (lossPercentage <= 5) {
      return { label: "Toleranz", color: "bg-yellow-500" };
    }

    // Moderate loss (5-15%)
    if (lossPercentage <= 15) {
      return { label: "Warnung", color: "bg-orange-500" };
    }

    // Significant loss (15-30%)
    if (lossPercentage <= 30) {
      return { label: "Verlust", color: "bg-red-500" };
    }

    // Critical loss (>30%)
    return { label: "Kritisch", color: "bg-red-700" };
  }

  // Fallback for edge cases (e.g., calculated stock is 0 but we have losses)
  return { label: "Verlust", color: "bg-red-500" };
}
