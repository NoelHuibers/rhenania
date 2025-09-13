// DashboardTab.tsx
"use client";

import { FileSpreadsheet } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { saveInventoryCount } from "~/server/actions/inventur/inventur";
import type { StockStatusWithDetails } from "./utils";
import {
  calculateLostStock,
  calculateLostValue,
  getStockStatus,
} from "./utils";

interface DashboardTabProps {
  stockItems: StockStatusWithDetails[];
  onInventorySaved: () => void;
}

export default function DashboardTab({
  stockItems,
  onInventorySaved,
}: DashboardTabProps) {
  const [purchases, setPurchases] = useState<{ [key: string]: number }>({});
  const [countedStock, setCountedStock] = useState<{ [key: string]: number }>(
    {}
  );
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    // Initialize counted stock with calculated values
    const initialStock: { [key: string]: number } = {};
    stockItems.forEach((item) => {
      initialStock[item.drinkId] = item.calculatedStock;
    });
    setCountedStock(initialStock);
  }, [stockItems]);

  const handlePurchaseInput = (drinkId: string, value: number) => {
    setPurchases((prev) => ({ ...prev, [drinkId]: value }));

    // Auto-update counted stock if it matches calculated
    const item = stockItems.find((i) => i.drinkId === drinkId);
    if (
      item &&
      countedStock[drinkId] === item.calculatedStock + (purchases[drinkId] || 0)
    ) {
      setCountedStock((prev) => ({
        ...prev,
        [drinkId]: item.calculatedStock + value,
      }));
    }
  };

  const handleCountedStockInput = (drinkId: string, value: number) => {
    setCountedStock((prev) => ({ ...prev, [drinkId]: value }));
  };

  const handleCreateInventory = () => {
    startSaving(async () => {
      try {
        const inventoryItems = stockItems.map((item) => ({
          drinkId: item.drinkId,
          countedStock: countedStock[item.drinkId] ?? item.calculatedStock,
          purchasedSince: purchases[item.drinkId] || 0,
        }));

        const result = await saveInventoryCount(inventoryItems);

        if (result.success) {
          toast.success("Inventur erfolgreich erstellt");
          onInventorySaved();
          setPurchases({});
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Inventur konnte nicht erstellt werden"
        );
      }
    });
  };

  // Calculate totals
  const totalSoldUnits = stockItems.reduce(
    (sum, item) => sum + item.soldSince,
    0
  );
  const totalPurchasedUnits = stockItems.reduce(
    (sum, item) => sum + (purchases[item.drinkId] || 0),
    0
  );

  const totalLostValue = stockItems.reduce((sum, item) => {
    const purchaseValue = purchases[item.drinkId] || 0;
    const calculatedWithPurchase = item.calculatedStock + purchaseValue;
    const actualStock = countedStock[item.drinkId] ?? calculatedWithPurchase;
    return (
      sum +
      calculateLostValue(
        { ...item, calculatedStock: calculatedWithPurchase },
        actualStock
      )
    );
  }, 0);

  const totalInventoryValue = stockItems.reduce((sum, item) => {
    const actualStock = countedStock[item.drinkId] ?? item.calculatedStock;
    return sum + actualStock * item.currentPrice;
  }, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle className="text-primary">Aktueller Bestand</CardTitle>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>
              Verkauft seit letzter Inventur:{" "}
              <span className="font-medium text-red-600">
                {totalSoldUnits} Flaschen
              </span>
            </span>
            {totalPurchasedUnits > 0 && (
              <span>
                Eingekauft:{" "}
                <span className="font-medium text-green-600">
                  {totalPurchasedUnits} Flaschen
                </span>
              </span>
            )}
            <span>
              Bestandswert:{" "}
              <span className="font-medium text-primary">
                €{totalInventoryValue.toFixed(2)}
              </span>
            </span>
            {totalLostValue > 0 && (
              <span>
                Verluste:{" "}
                <span className="font-medium text-destructive">
                  €{totalLostValue.toFixed(2)}
                </span>
              </span>
            )}
          </div>
        </div>
        <Button onClick={handleCreateInventory} disabled={isSaving} size="lg">
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          {isSaving ? "Erstelle..." : "Inventur abschließen"}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-semibold text-primary">
                  Getränk
                </th>
                <th className="text-right p-3 font-semibold text-primary">
                  Letzte Inventur
                </th>
                <th className="text-center p-3 font-semibold text-green-600">
                  Eingekauft (+)
                </th>
                <th className="text-right p-3 font-semibold text-red-600">
                  Verkauft (−)
                </th>
                <th className="text-right p-3 font-semibold text-primary">
                  Soll-Bestand
                </th>
                <th className="text-center p-3 font-semibold text-primary">
                  Ist-Bestand
                </th>
                <th className="text-right p-3 font-semibold text-primary">
                  Differenz
                </th>
                <th className="text-right p-3 font-semibold text-primary">
                  Preis
                </th>
                <th className="text-center p-3 font-semibold text-primary">
                  Status
                </th>
                <th className="text-right p-3 font-semibold text-destructive">
                  Verlust (€)
                </th>
              </tr>
            </thead>
            <tbody>
              {stockItems.map((item, index) => {
                const purchaseValue = purchases[item.drinkId] || 0;
                const calculatedWithPurchase =
                  item.calculatedStock + purchaseValue;
                const actualStock =
                  countedStock[item.drinkId] ?? calculatedWithPurchase;
                const lostStock = calculateLostStock(
                  { calculatedStock: calculatedWithPurchase },
                  actualStock
                );
                const lostValue = calculateLostValue(
                  { ...item, calculatedStock: calculatedWithPurchase },
                  actualStock
                );
                const status = getStockStatus(
                  { calculatedStock: calculatedWithPurchase },
                  actualStock
                );

                return (
                  <tr
                    key={item.drinkId}
                    className={`border-b border-border ${
                      index % 2 === 0 ? "bg-muted/50" : "bg-background"
                    } ${
                      purchaseValue > 0
                        ? "bg-green-50 dark:bg-green-950/20"
                        : ""
                    }`}
                  >
                    <td className="p-3 font-medium">{item.drinkName}</td>
                    <td className="p-3 text-right">
                      {item.lastInventoryStock}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2 justify-center">
                        <Input
                          type="number"
                          value={purchaseValue || ""}
                          onChange={(e) => {
                            const value =
                              e.target.value === ""
                                ? 0
                                : Number(e.target.value);
                            handlePurchaseInput(item.drinkId, value);
                          }}
                          className={`w-20 h-8 ${
                            purchaseValue > 0 ? "border-green-500" : ""
                          }`}
                          min="0"
                          placeholder="0"
                          disabled={isSaving}
                        />
                        {purchaseValue > 0 && (
                          <span className="text-green-600 font-bold">
                            +{purchaseValue}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <span className="text-red-600 font-semibold">
                        −{item.soldSince}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className={
                          purchaseValue > 0 ? "font-bold text-green-600" : ""
                        }
                      >
                        {calculatedWithPurchase}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <Input
                        type="number"
                        value={actualStock}
                        onChange={(e) => {
                          const value =
                            e.target.value === "" ? 0 : Number(e.target.value);
                          handleCountedStockInput(item.drinkId, value);
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
                      {lostValue > 0 ? `€${lostValue.toFixed(2)}` : "-"}
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
