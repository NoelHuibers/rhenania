// DashboardTab.tsx
"use client";

import { FileSpreadsheet, Save } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  applyPurchase,
  getStockData,
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
  const [localCountedStock, setLocalCountedStock] = useState<{
    [key: string]: number;
  }>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    const initialStock: { [key: string]: number } = {};
    stockItems.forEach((item) => {
      initialStock[item.drinkId] = countedStock[item.drinkId] ?? item.istStock;
    });
    setLocalCountedStock(initialStock);
  }, [stockItems, countedStock]);

  useEffect(() => {
    const hasPurchaseChanges = Object.values(purchases).some(
      (value) => value > 0
    );
    const hasStockChanges = Object.keys(localCountedStock).some((drinkId) => {
      const original = stockItems.find((item) => item.drinkId === drinkId);
      return (
        original &&
        localCountedStock[drinkId] !==
          (countedStock[drinkId] ?? original.istStock)
      );
    });
    setHasChanges(hasPurchaseChanges || hasStockChanges);
  }, [purchases, localCountedStock, stockItems, countedStock]);

  const handlePurchaseInput = (drinkId: string, value: number) => {
    setPurchases((prev) => ({ ...prev, [drinkId]: value }));

    const item = stockItems.find((i) => i.drinkId === drinkId);
    if (item) {
      const newCalculatedStock =
        item.calculatedStock + value - (purchases[drinkId] || 0);
      if (localCountedStock[drinkId] === item.calculatedStock) {
        setLocalCountedStock((prev) => ({
          ...prev,
          [drinkId]: newCalculatedStock,
        }));
      }
    }
  };

  const handleActualStockInput = (drinkId: string, value: number) => {
    setLocalCountedStock((prev) => ({ ...prev, [drinkId]: value }));
    onCountedStockUpdate(drinkId, value);
  };

  const handleSaveChanges = async () => {
    startTransition(async () => {
      try {
        for (const [drinkId, quantity] of Object.entries(purchases)) {
          if (quantity > 0) {
            const result = await applyPurchase(drinkId, quantity);
            if (!result.success) {
              throw new Error(result.error);
            }
          }
        }

        const updatedData = await getStockData();

        onStockUpdate(updatedData);

        const updatedLocalStock: { [key: string]: number } = {};
        updatedData.forEach((item) => {
          if (localCountedStock[item.drinkId] !== undefined) {
            const originalItem = stockItems.find(
              (i) => i.drinkId === item.drinkId
            );
            if (
              originalItem &&
              localCountedStock[item.drinkId] ===
                originalItem.calculatedStock + (purchases[item.drinkId] || 0)
            ) {
              updatedLocalStock[item.drinkId] = item.calculatedStock;
            } else {
              updatedLocalStock[item.drinkId] =
                localCountedStock[item.drinkId] ?? item.calculatedStock;
            }
          } else {
            updatedLocalStock[item.drinkId] = item.calculatedStock;
          }
        });

        setLocalCountedStock(updatedLocalStock);
        setPurchases({});
        setHasChanges(false);

        toast.success("Änderungen erfolgreich gespeichert");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Änderungen konnten nicht gespeichert werden"
        );
      }
    });
  };

  const handleCreateNewInventory = () => {
    startSaving(async () => {
      try {
        const inventoryItems = stockItems.map((item) => ({
          drinkId: item.drinkId,
          countedStock: localCountedStock[item.drinkId] ?? item.istStock,
        }));

        const result = await saveInventoryCount(inventoryItems);

        if (result.success) {
          toast.success("Neue Inventur erfolgreich erstellt");
          onInventorySaved();
          setPurchases({});
          setHasChanges(false);
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

  const totalSoldUnits = stockItems.reduce(
    (sum, item) => sum + item.soldSince,
    0
  );
  const totalPurchasedUnits = stockItems.reduce(
    (sum, item) => sum + item.purchasedSince + (purchases[item.drinkId] || 0),
    0
  );
  const totalLostValue = stockItems.reduce((sum, item) => {
    const actualStock = localCountedStock[item.drinkId] ?? item.istStock;
    return sum + calculateLostValue(item, actualStock);
  }, 0);

  const totalInventoryValue = stockItems.reduce((sum, item) => {
    const actualStock = localCountedStock[item.drinkId] ?? item.istStock;
    return sum + actualStock * item.currentPrice;
  }, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle className="text-primary">Aktueller Bestand</CardTitle>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>
              Gesamtverkauft:{" "}
              <span className="font-medium text-red-600">
                {totalSoldUnits} Flaschen
              </span>
            </span>
            <span>
              Gesamteingekauft:{" "}
              <span className="font-medium text-green-600">
                {totalPurchasedUnits} Flaschen
              </span>
            </span>
            <span>
              Bestandswert:{" "}
              <span className="font-medium text-primary">
                €{totalInventoryValue.toFixed(2)}
              </span>
            </span>
            <span>
              Gesamtverluste:{" "}
              <span className="font-medium text-destructive">
                €{totalLostValue.toFixed(2)}
              </span>
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSaveChanges}
            disabled={!hasChanges || isPending}
            variant={hasChanges ? "default" : "outline"}
          >
            <Save className="h-4 w-4 mr-2" />
            {isPending ? "Speichere..." : "Änderungen speichern"}
          </Button>
          <Button
            onClick={handleCreateNewInventory}
            disabled={isSaving}
            variant="secondary"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            {isSaving ? "Erstelle..." : "Inventur abschließen"}
          </Button>
        </div>
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
                  Soll Bestand
                </th>
                <th className="text-center p-3 font-semibold text-primary">
                  Ist Bestand
                </th>
                <th className="text-right p-3 font-semibold text-primary">
                  Schwund
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
                  localCountedStock[item.drinkId] ?? item.istStock;
                const lostStock = calculateLostStock(
                  { ...item, calculatedStock: calculatedWithPurchase },
                  actualStock
                );
                const lostValue = calculateLostValue(
                  { ...item, calculatedStock: calculatedWithPurchase },
                  actualStock
                );
                const status = getStockStatus(
                  { ...item, calculatedStock: calculatedWithPurchase },
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
                              handlePurchaseInput(item.drinkId, value);
                            }}
                            className={`w-20 h-8 ${
                              purchaseValue > 0 ? "border-green-500" : ""
                            }`}
                            min="0"
                            placeholder="Hinzufügen"
                            disabled={isPending}
                          />
                          {purchaseValue > 0 && (
                            <span className="text-green-600 font-bold">
                              +{purchaseValue}
                            </span>
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
                          Umsatz
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <span
                        className={
                          purchaseValue > 0 ? "font-bold text-green-600" : ""
                        }
                      >
                        {calculatedWithPurchase}
                      </span>
                      {purchaseValue > 0 && (
                        <div className="text-xs text-green-600">
                          ({item.calculatedStock} + {purchaseValue})
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <Input
                        type="number"
                        value={actualStock}
                        onChange={(e) => {
                          const value =
                            e.target.value === "" ? 0 : Number(e.target.value);
                          handleActualStockInput(item.drinkId, value);
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
                  Summen:
                </td>
                <td className="p-3 text-right font-semibold text-red-600">
                  -{totalSoldUnits} Flaschen
                </td>
                <td colSpan={5} className="p-3 text-right font-semibold">
                  Gesamtverluste:
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
