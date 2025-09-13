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

  if (difference === 0) {
    return { label: "OK", color: "bg-green-500" };
  } else if (difference > 0) {
    return { label: "Überschuss", color: "bg-blue-500" };
  } else if (difference >= -2) {
    return { label: "Toleranz", color: "bg-yellow-500" };
  } else {
    return { label: "Verlust", color: "bg-red-500" };
  }
}
