// AdjustmentTab.tsx
"use client";

import { Calculator, Minus, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { applyStockAdjustment } from "~/server/actions/inventur/inventur";
import type { StockStatusWithDetails } from "./utils";

interface AdjustmentsTabProps {
  stockItems: StockStatusWithDetails[];
  onAdjustmentsApplied: () => Promise<void>;
}

export default function AdjustmentsTab({
  stockItems,
  onAdjustmentsApplied,
}: AdjustmentsTabProps) {
  const [adjustments, setAdjustments] = useState<{
    [key: string]: { amount: number; reason?: string };
  }>({});
  const [adjustmentType, setAdjustmentType] = useState<"purchase" | "loss">(
    "purchase"
  );
  const [isPending, startTransition] = useTransition();

  const handleApplyAdjustments = () => {
    startTransition(async () => {
      try {
        const adjustmentPromises = Object.entries(adjustments)
          .filter(([_, adj]) => adj.amount > 0)
          .map(([drinkId, adj]) => {
            const drink = stockItems.find((item) => item.drinkId === drinkId);
            if (!drink) throw new Error(`Drink ${drinkId} not found`);

            return applyStockAdjustment({
              drinkId,
              adjustmentType: adjustmentType,
              quantity:
                adjustmentType === "purchase" ? adj.amount : -adj.amount,
              unitPrice: drink.currentPrice,
              totalCost: adj.amount * drink.currentPrice,
              reason: adj.reason || `${adjustmentType} adjustment`,
            });
          });

        if (adjustmentPromises.length === 0) {
          toast.error("Please enter an amount for at least one item");
          return;
        }

        await Promise.all(adjustmentPromises);

        toast.success("Adjustments applied successfully");
        await onAdjustmentsApplied();
        setAdjustments({});
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to apply adjustments"
        );
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-primary">
            <Calculator className="h-5 w-5" />
            Stock Adjustments
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setAdjustmentType("purchase")}
              className={`transition-all ${
                adjustmentType === "purchase"
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-lg scale-105"
                  : "bg-green-100 hover:bg-green-200 text-green-700 opacity-60"
              }`}
            >
              <Plus className="h-4 w-4 mr-1" />
              Purchase
            </Button>
            <Button
              onClick={() => setAdjustmentType("loss")}
              className={`transition-all ${
                adjustmentType === "loss"
                  ? "bg-red-600 hover:bg-red-700 text-white shadow-lg scale-105"
                  : "bg-red-100 hover:bg-red-200 text-red-700 opacity-60"
              }`}
            >
              <Minus className="h-4 w-4 mr-1" />
              Loss
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 font-semibold text-primary">
                    Drink Name
                  </th>
                  <th className="text-center p-3 font-semibold text-primary">
                    Amount
                  </th>
                  <th className="text-center p-3 font-semibold text-primary">
                    Price per Unit
                  </th>
                  <th className="text-center p-3 font-semibold text-primary">
                    Total Price
                  </th>
                  <th className="text-center p-3 font-semibold text-primary">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody>
                {stockItems.map((item, index) => {
                  const adjustment = adjustments[item.drinkId] || {
                    amount: 0,
                    reason: "",
                  };
                  const totalPrice = adjustment.amount * item.currentPrice;

                  return (
                    <tr
                      key={item.drinkId}
                      className={`border-b border-border ${
                        index % 2 === 0 ? "bg-muted/50" : "bg-background"
                      }`}
                    >
                      <td className="p-3 font-medium">{item.drinkName}</td>
                      <td className="p-3">
                        <Input
                          type="number"
                          value={adjustment.amount || ""}
                          onChange={(e) => {
                            const value =
                              e.target.value === ""
                                ? 0
                                : Number(e.target.value);
                            setAdjustments((prev) => ({
                              ...prev,
                              [item.drinkId]: {
                                amount: value,
                                reason: prev[item.drinkId]?.reason || "",
                              },
                            }));
                          }}
                          className="w-24 mx-auto"
                          min="0"
                          placeholder="0"
                        />
                      </td>
                      <td className="p-3 text-center font-medium">
                        €{item.currentPrice.toFixed(2)}
                      </td>
                      <td className="p-3 text-center font-semibold">
                        {totalPrice > 0 ? (
                          <span
                            className={
                              adjustmentType === "loss"
                                ? "text-red-600"
                                : "text-green-600"
                            }
                          >
                            €{totalPrice.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">€0.00</span>
                        )}
                      </td>
                      <td className="p-3">
                        <Input
                          type="text"
                          value={adjustment.reason || ""}
                          onChange={(e) =>
                            setAdjustments((prev) => ({
                              ...prev,
                              [item.drinkId]: {
                                amount: prev[item.drinkId]?.amount || 0,
                                reason: e.target.value,
                              },
                            }))
                          }
                          className="w-40 mx-auto"
                          placeholder="Optional"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30">
                  <td colSpan={3} className="p-3 text-right font-semibold">
                    Total {adjustmentType === "purchase" ? "Purchase" : "Loss"}:
                  </td>
                  <td className="p-3 text-center font-bold text-lg">
                    <span
                      className={
                        adjustmentType === "loss"
                          ? "text-red-600"
                          : "text-green-600"
                      }
                    >
                      €
                      {Object.entries(adjustments)
                        .reduce((sum, [drinkId, adj]) => {
                          const item = stockItems.find(
                            (i) => i.drinkId === drinkId
                          );
                          return sum + adj.amount * (item?.currentPrice || 0);
                        }, 0)
                        .toFixed(2)}
                    </span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleApplyAdjustments}
              disabled={isPending}
              className="bg-secondary hover:bg-secondary/90"
            >
              {isPending ? "Applying..." : "Apply Adjustments"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
