// CountTab.tsx
"use client";

import { Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import type { StockStatusWithDetails } from "./utils";

interface CountTabProps {
  stockItems: StockStatusWithDetails[];
  countedStock: { [key: string]: number };
  onUpdateStock: (drinkId: string, value: number) => void;
}

export default function CountTab({
  stockItems,
  countedStock,
  onUpdateStock,
}: CountTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary">
          <Package className="h-5 w-5" />
          Manual Count
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-semibold text-primary">
                  Drink Name
                </th>
                <th className="text-center p-3 font-semibold text-primary">
                  Expected Stock
                </th>
                <th className="text-center p-3 font-semibold text-primary">
                  Actual Count
                </th>
                <th className="text-center p-3 font-semibold text-primary">
                  Difference
                </th>
              </tr>
            </thead>
            <tbody>
              {stockItems.map((item, index) => {
                const actualCount = countedStock[item.drinkId] ?? item.istStock;
                const difference = actualCount - item.calculatedStock;

                return (
                  <tr
                    key={item.drinkId}
                    className={`border-b border-border ${
                      index % 2 === 0 ? "bg-muted/50" : "bg-background"
                    }`}
                  >
                    <td className="p-3 font-medium">{item.drinkName}</td>
                    <td className="p-3 text-center font-semibold">
                      {item.calculatedStock}
                    </td>
                    <td className="p-3">
                      <Input
                        type="number"
                        value={actualCount}
                        onChange={(e) =>
                          onUpdateStock(item.drinkId, Number(e.target.value))
                        }
                        className="w-32 mx-auto"
                        min="0"
                      />
                    </td>
                    <td
                      className={`p-3 text-center font-semibold ${
                        difference < 0
                          ? "text-destructive"
                          : difference > 0
                          ? "text-green-600"
                          : ""
                      }`}
                    >
                      {difference > 0 && "+"}
                      {difference}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
