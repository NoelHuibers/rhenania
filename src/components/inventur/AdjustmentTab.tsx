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
    [key: string]: { amount: number; totalPrice: number; reason?: string };
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
          .map(([drinkId, adj]) =>
            applyStockAdjustment({
              drinkId,
              adjustmentType: adjustmentType,
              quantity:
                adjustmentType === "purchase" ? adj.amount : -adj.amount,
              unitPrice: adj.totalPrice / adj.amount,
              totalCost: adj.totalPrice,
              reason: adj.reason,
            })
          );

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
              variant={adjustmentType === "purchase" ? "default" : "outline"}
              onClick={() => setAdjustmentType("purchase")}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1" />
              Purchase
            </Button>
            <Button
              variant={adjustmentType === "loss" ? "default" : "outline"}
              onClick={() => setAdjustmentType("loss")}
              className="bg-red-600 hover:bg-red-700 text-white"
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
                    Total Price
                  </th>
                  <th className="text-center p-3 font-semibold text-primary">
                    Price per Unit
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
                    totalPrice: 0,
                    reason: "",
                  };
                  const pricePerUnit =
                    adjustment.amount > 0
                      ? adjustment.totalPrice / adjustment.amount
                      : 0;

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
                          value={adjustment.amount}
                          onChange={(e) =>
                            setAdjustments((prev) => ({
                              ...prev,
                              [item.drinkId]: {
                                ...adjustment,
                                amount: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-24 mx-auto"
                          min="0"
                        />
                      </td>
                      <td className="p-3">
                        <Input
                          type="number"
                          step="0.01"
                          value={adjustment.totalPrice}
                          onChange={(e) =>
                            setAdjustments((prev) => ({
                              ...prev,
                              [item.drinkId]: {
                                ...adjustment,
                                totalPrice: Number(e.target.value),
                              },
                            }))
                          }
                          className="w-32 mx-auto"
                          min="0"
                        />
                      </td>
                      <td className="p-3 text-center text-muted-foreground">
                        €{pricePerUnit.toFixed(2)}
                      </td>
                      <td className="p-3">
                        <Input
                          type="text"
                          value={adjustment.reason || ""}
                          onChange={(e) =>
                            setAdjustments((prev) => ({
                              ...prev,
                              [item.drinkId]: {
                                ...adjustment,
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
