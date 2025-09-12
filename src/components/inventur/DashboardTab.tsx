// DashboardTab.tsx
"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  applyPurchase,
  saveInventoryCount,
} from "~/server/actions/inventur/inventur";
import type { StockStatusWithDetails } from "./utils";
import {
  calculateLostStock,
  calculateLostValue,
  getStockStatus,
} from "./utils";

interface DashboardTabProps {
  stockItems: StockStatusWithDetails[];
  countedStock: { [key: string]: number };
  onStockUpdate: (updatedData: StockStatusWithDetails[]) => void;
  onCountedStockUpdate: (drinkId: string, value: number) => void;
  onInventorySaved: () => void;
}

export default function DashboardTab({
  stockItems,
  countedStock,
  onStockUpdate,
  onCountedStockUpdate,
  onInventorySaved,
}: DashboardTabProps) {
  const [purchases, setPurchases] = useState<{ [key: string]: number }>({});
  const [isPending, startTransition] = useTransition();
  const [isSaving, startSaving] = useTransition();

  const handlePurchaseUpdate = (drinkId: string, quantity: number) => {
    if (quantity <= 0) return;

    startTransition(async () => {
      try {
        const result = await applyPurchase(drinkId, quantity);

        if (result.success && result.data) {
          toast.success(`Purchase of ${quantity} units recorded`);
          onStockUpdate(result.data);
          setPurchases((prev) => ({ ...prev, [drinkId]: 0 }));
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to record purchase"
        );
      }
    });
  };

  const handleSaveInventory = () => {
    startSaving(async () => {
      try {
        const inventoryItems = stockItems.map((item) => ({
          drinkId: item.drinkId,
          countedStock: countedStock[item.drinkId] ?? item.istStock,
        }));

        const result = await saveInventoryCount(inventoryItems);

        if (result.success) {
          toast.success("Inventory saved successfully");
          onInventorySaved();
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save inventory"
        );
      }
    });
  };

  // Calculate totals for summary
  const totalSoldUnits = stockItems.reduce(
    (sum, item) => sum + item.soldSince,
    0
  );
  const totalPurchasedUnits = stockItems.reduce(
    (sum, item) => sum + item.purchasedSince,
    0
  );
  const totalLostValue = stockItems.reduce((sum, item) => {
    const actualStock = countedStock[item.drinkId] ?? item.istStock;
    return sum + calculateLostValue(item, actualStock);
  }, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle className="text-primary">Current Inventory</CardTitle>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>
              Total Sold:{" "}
              <span className="font-medium text-red-600">
                {totalSoldUnits} units
              </span>
            </span>
            <span>
              Total Purchased:{" "}
              <span className="font-medium text-green-600">
                {totalPurchasedUnits} units
              </span>
            </span>
            <span>
              Total Losses:{" "}
              <span className="font-medium text-destructive">
                €{totalLostValue.toFixed(2)}
              </span>
            </span>
          </div>
        </div>
        <Button onClick={handleSaveInventory} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving..." : "Save Inventory"}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-semibold text-primary">
                  Drink Name
                </th>
                <th className="text-right p-3 font-semibold text-primary">
                  Last Inventory
                </th>
                <th className="text-center p-3 font-semibold text-green-600">
                  Purchased (+)
                </th>
                <th className="text-right p-3 font-semibold text-red-600">
                  Sold (−)
                </th>
                <th className="text-right p-3 font-semibold text-primary">
                  Calculated Stock
                </th>
                <th className="text-center p-3 font-semibold text-primary">
                  Actual Stock
                </th>
                <th className="text-right p-3 font-semibold text-primary">
                  Lost Stock
                </th>
                <th className="text-right p-3 font-semibold text-primary">
                  Price
                </th>
                <th className="text-center p-3 font-semibold text-primary">
                  Status
                </th>
                <th className="text-right p-3 font-semibold text-destructive">
                  Lost (€)
                </th>
              </tr>
            </thead>
            <tbody>
              {stockItems.map((item, index) => {
                const actualStock = countedStock[item.drinkId] ?? item.istStock;
                const lostStock = calculateLostStock(item, actualStock);
                const lostValue = calculateLostValue(item, actualStock);
                const status = getStockStatus(item, actualStock);
                const purchaseValue = purchases[item.drinkId] || 0;

                return (
                  <tr
                    key={item.drinkId}
                    className={`border-b border-border ${
                      index % 2 === 0 ? "bg-muted/50" : "bg-background"
                    }`}
                  >
                    <td className="p-3 font-medium">{item.drinkName}</td>
                    <td className="p-3 text-right">
                      {item.lastInventoryStock}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2 justify-center">
                        <span className="text-green-600 font-semibold min-w-[3rem] text-right">
                          +{item.purchasedSince}
                        </span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={purchaseValue || ""}
                            onChange={(e) => {
                              const value =
                                e.target.value === ""
                                  ? 0
                                  : Number(e.target.value);
                              setPurchases((prev) => ({
                                ...prev,
                                [item.drinkId]: value,
                              }));
                            }}
                            className="w-20 h-8"
                            min="0"
                            placeholder="Add"
                            disabled={isPending}
                          />
                          {purchaseValue > 0 && (
                            <Button
                              size="sm"
                              onClick={() =>
                                handlePurchaseUpdate(
                                  item.drinkId,
                                  purchaseValue
                                )
                              }
                              disabled={isPending}
                              className="h-8 px-2 bg-green-600 hover:bg-green-700"
                            >
                              ✓
                            </Button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-red-600 font-semibold">
                        −{item.soldSince}
                      </span>
                      {item.soldSince > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          €{(item.soldSince * item.currentPrice).toFixed(2)}{" "}
                          revenue
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right">{item.calculatedStock}</td>
                    <td className="p-3 text-center">
                      <Input
                        type="number"
                        value={countedStock[item.drinkId] ?? actualStock}
                        onChange={(e) => {
                          const value =
                            e.target.value === "" ? 0 : Number(e.target.value);
                          onCountedStockUpdate(item.drinkId, value);
                        }}
                        className="w-20 h-8 mx-auto"
                        min="0"
                        disabled={isSaving}
                      />
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className={
                          lostStock > 0 ? "text-red-600 font-semibold" : ""
                        }
                      >
                        {lostStock > 0 ? `-${lostStock}` : lostStock}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      €{item.currentPrice.toFixed(2)}
                    </td>
                    <td className="p-3 text-center">
                      <Badge className={`${status.color} text-white`}>
                        {status.label}
                      </Badge>
                    </td>
                    <td className="p-3 text-right text-destructive font-semibold">
                      €{lostValue.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/30">
                <td colSpan={3} className="p-3 text-right font-semibold">
                  Totals:
                </td>
                <td className="p-3 text-right font-semibold text-red-600">
                  −{totalSoldUnits} units
                </td>
                <td colSpan={5} className="p-3 text-right font-semibold">
                  Total Losses:
                </td>
                <td className="p-3 text-right text-destructive font-bold text-lg">
                  €{totalLostValue.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
