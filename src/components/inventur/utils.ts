// utils.ts

export type StockStatusWithDetails = {
  drinkId: string;
  drinkName: string;
  lastInventoryStock: number;
  purchasedSince: number;
  soldSince: number;
  adjustmentsSince: number;
  calculatedStock: number;
  istStock: number;
  currentPrice: number;
  lastInventoryDate: Date | null;
};

export type InventoryWithItems = {
  id: string;
  inventoryDate: Date;
  status: string;
  notes: string | null;
  totalLosses: number;
  items: Array<{
    drinkId: string;
    drinkName: string;
    countedStock: number;
    expectedStock: number;
    difference: number;
  }>;
};

export type StockAdjustmentInput = {
  drinkId: string;
  adjustmentType: "purchase" | "correction" | "loss" | "return";
  quantity: number;
  unitPrice: number;
  totalCost: number;
  reason?: string;
  invoiceNumber?: string;
  supplier?: string;
};

export function calculateLostStock(
  item: StockStatusWithDetails,
  actualStock: number
): number {
  return Math.max(0, item.calculatedStock - actualStock);
}

export function calculateLostValue(
  item: StockStatusWithDetails,
  actualStock: number
): number {
  return calculateLostStock(item, actualStock) * item.currentPrice;
}

export function getStockStatus(
  item: StockStatusWithDetails,
  actualStock: number
) {
  const lostStock = calculateLostStock(item, actualStock);
  const lossPercentage =
    item.calculatedStock > 0 ? (lostStock / item.calculatedStock) * 100 : 0;

  if (lossPercentage > 20) {
    return { label: "Critical", color: "bg-destructive" };
  }
  if (lossPercentage > 10) {
    return { label: "Low", color: "bg-yellow-500" };
  }
  return { label: "Good", color: "bg-green-500" };
}
