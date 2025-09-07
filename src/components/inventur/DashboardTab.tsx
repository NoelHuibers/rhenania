"use client";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { StockStatusWithDetails } from "./utils";
import {
  calculateLostStock,
  calculateLostValue,
  getStockStatus,
} from "./utils";

interface DashboardTabProps {
  stockItems: StockStatusWithDetails[];
  countedStock: { [key: string]: number };
}

export default function DashboardTab({
  stockItems,
  countedStock,
}: DashboardTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-primary">Current Inventory</CardTitle>
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
                <th className="text-right p-3 font-semibold text-green-600">
                  Purchased (+)
                </th>
                <th className="text-right p-3 font-semibold text-red-600">
                  Sold (−)
                </th>
                <th className="text-right p-3 font-semibold text-primary">
                  Calculated Stock
                </th>
                <th className="text-right p-3 font-semibold text-primary">
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
                    <td className="p-3 text-right text-green-600 font-semibold">
                      +{item.purchasedSince}
                    </td>
                    <td className="p-3 text-right text-red-600 font-semibold">
                      −{item.soldSince}
                    </td>
                    <td className="p-3 text-right">{item.calculatedStock}</td>
                    <td className="p-3 text-right font-semibold">
                      {actualStock}
                    </td>
                    <td className="p-3 text-right">{lostStock}</td>
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
                <td colSpan={9} className="p-3 text-right font-semibold">
                  Total Losses:
                </td>
                <td className="p-3 text-right text-destructive font-bold text-lg">
                  €
                  {stockItems
                    .reduce((sum, item) => {
                      const actualStock =
                        countedStock[item.drinkId] ?? item.istStock;
                      return sum + calculateLostValue(item, actualStock);
                    }, 0)
                    .toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
