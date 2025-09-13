// DashboardTab.tsx
"use client";

import { ChevronDown, ChevronUp, FileSpreadsheet, Save } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { createNewBilling } from "~/server/actions/billings/billings";
import {
  saveInventoryCount,
  saveQuickAdjustments,
} from "~/server/actions/inventur/inventur";
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
  const [changedItems, setChangedItems] = useState<Set<string>>(new Set());
  const [isSaving, startSaving] = useTransition();
  const [isQuickSaving, startQuickSaving] = useTransition();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [showInventoryDialog, setShowInventoryDialog] = useState(false);
  const [createInvoice, setCreateInvoice] = useState(false);

  useEffect(() => {
    // Initialize counted stock with calculated values
    const initialStock: { [key: string]: number } = {};
    stockItems.forEach((item) => {
      initialStock[item.drinkId] = item.calculatedStock;
    });
    setCountedStock(initialStock);
    // Reset changed items when stock items update
    setChangedItems(new Set());
    setPurchases({});
  }, [stockItems]);

  const toggleItemExpansion = (drinkId: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(drinkId)) {
        newSet.delete(drinkId);
      } else {
        newSet.add(drinkId);
      }
      return newSet;
    });
  };

  const handlePurchaseInput = (drinkId: string, value: number) => {
    setPurchases((prev) => ({ ...prev, [drinkId]: value }));

    // Mark as changed if value > 0
    if (value > 0) {
      setChangedItems((prev) => new Set(prev).add(drinkId));
    } else {
      // Remove from changed if purchase is 0 and count matches calculated
      const item = stockItems.find((i) => i.drinkId === drinkId);
      if (item && countedStock[drinkId] === item.calculatedStock) {
        setChangedItems((prev) => {
          const newSet = new Set(prev);
          newSet.delete(drinkId);
          return newSet;
        });
      }
    }

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

    // Mark as changed if different from calculated
    const item = stockItems.find((i) => i.drinkId === drinkId);
    if (item) {
      const expectedStock = item.calculatedStock + (purchases[drinkId] || 0);
      if (value !== expectedStock) {
        setChangedItems((prev) => new Set(prev).add(drinkId));
      } else if (purchases[drinkId] === 0 || !purchases[drinkId]) {
        // Remove from changed if it matches expected and no purchases
        setChangedItems((prev) => {
          const newSet = new Set(prev);
          newSet.delete(drinkId);
          return newSet;
        });
      }
    }
  };

  const handleQuickSave = () => {
    startQuickSaving(async () => {
      try {
        const adjustments = Array.from(changedItems)
          .map((drinkId) => {
            const item = stockItems.find((i) => i.drinkId === drinkId);
            const purchaseValue = purchases[drinkId] || 0;
            const currentCount = countedStock[drinkId];

            return {
              drinkId,
              // Save the actual counted stock (Ist-Bestand) as is
              countedStock:
                currentCount !== undefined ? currentCount : undefined,
              // Save purchases separately
              purchasedQuantity: purchaseValue > 0 ? purchaseValue : undefined,
            };
          })
          .filter(
            (adj) =>
              adj.countedStock !== undefined ||
              adj.purchasedQuantity !== undefined
          );

        if (adjustments.length === 0) {
          toast.info("Keine Änderungen zum Speichern");
          return;
        }

        const result = await saveQuickAdjustments(adjustments);

        if (result.success) {
          toast.success(`${adjustments.length} Artikel aktualisiert`);
          onInventorySaved(); // Refresh parent
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Änderungen konnten nicht gespeichert werden"
        );
      }
    });
  };

  const handleCreateInventory = (withInvoice: boolean = false) => {
    startSaving(async () => {
      try {
        const inventoryItems = stockItems.map((item) => ({
          drinkId: item.drinkId,
          countedStock: countedStock[item.drinkId] ?? item.calculatedStock,
          purchasedSince: purchases[item.drinkId] || 0,
        }));

        const result = await saveInventoryCount(inventoryItems);

        if (withInvoice) {
          await createNewBilling();
        }

        if (result.success) {
          toast.success(
            withInvoice
              ? "Inventur und Rechnung erfolgreich erstellt"
              : "Inventur erfolgreich erstellt"
          );
          onInventorySaved();
          setShowInventoryDialog(false);
          setCreateInvoice(false);
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

  const hasChanges = changedItems.size > 0;

  return (
    <>
      <Card className="w-full">
        <CardHeader className="flex flex-col space-y-4 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-primary text-lg sm:text-xl">
                Aktueller Bestand
              </CardTitle>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleQuickSave}
                disabled={!hasChanges || isQuickSaving}
                variant={hasChanges ? "default" : "outline"}
                className="w-full sm:w-auto text-sm"
              >
                <Save className="h-4 w-4 mr-2" />
                {isQuickSaving
                  ? "Speichere..."
                  : hasChanges
                  ? `${changedItems.size} speichern`
                  : "Keine Änderungen"}
              </Button>
              <Button
                onClick={() => setShowInventoryDialog(true)}
                disabled={isSaving}
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto text-sm"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {isSaving ? "Erstelle..." : "Vollständige Inventur"}
              </Button>
            </div>
          </div>

          {/* Stats Grid for Mobile */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-4 text-xs sm:text-sm">
            <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded">
              <span className="text-muted-foreground block">Verkauft</span>
              <span className="font-medium text-red-600">
                {totalSoldUnits} Fl.
              </span>
            </div>
            {totalPurchasedUnits > 0 && (
              <div className="bg-green-50 dark:bg-green-950/20 p-2 rounded">
                <span className="text-muted-foreground block">Eingekauft</span>
                <span className="font-medium text-green-600">
                  {totalPurchasedUnits} Fl.
                </span>
              </div>
            )}
            <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded">
              <span className="text-muted-foreground block">Bestandswert</span>
              <span className="font-medium text-primary">
                €{totalInventoryValue.toFixed(2)}
              </span>
            </div>
            {totalLostValue > 0 && (
              <div className="bg-red-50 dark:bg-red-950/20 p-2 rounded">
                <span className="text-muted-foreground block">Verluste</span>
                <span className="font-medium text-destructive">
                  €{totalLostValue.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0 sm:p-6">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-x-auto">
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
                  const isChanged = changedItems.has(item.drinkId);

                  return (
                    <tr
                      key={item.drinkId}
                      className={`border-b border-border ${
                        index % 2 === 0 ? "bg-muted/50" : "bg-background"
                      } ${isChanged ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
                    >
                      <td className="p-3 font-medium">
                        {item.drinkName}
                        {isChanged && (
                          <span className="ml-2 text-xs text-blue-600">●</span>
                        )}
                      </td>
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
                            disabled={isSaving || isQuickSaving}
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
                              e.target.value === ""
                                ? 0
                                : Number(e.target.value);
                            handleCountedStockInput(item.drinkId, value);
                          }}
                          className="w-20 h-8 mx-auto"
                          min="0"
                          disabled={isSaving || isQuickSaving}
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

          {/* Mobile Card View */}
          <div className="lg:hidden space-y-2 p-4">
            {stockItems.map((item) => {
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
              const isChanged = changedItems.has(item.drinkId);
              const isExpanded = expandedItems.has(item.drinkId);

              return (
                <div
                  key={item.drinkId}
                  className={`border rounded-lg p-3 ${
                    isChanged
                      ? "bg-blue-50 dark:bg-blue-950/20 border-blue-300"
                      : "bg-card"
                  }`}
                >
                  {/* Header Row */}
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleItemExpansion(item.drinkId)}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <h3 className="font-medium text-sm">
                        {item.drinkName}
                        {isChanged && (
                          <span className="ml-2 text-xs text-blue-600">●</span>
                        )}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${status.color} text-white text-xs`}>
                        {status.label}
                      </Badge>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Quick Info Row */}
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>Soll: {calculatedWithPurchase}</span>
                    <span>Ist: {actualStock}</span>
                    {lostStock > 0 && (
                      <span className="text-red-600">Diff: -{lostStock}</span>
                    )}
                    {lostValue > 0 && (
                      <span className="text-destructive">
                        -€{lostValue.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t space-y-3">
                      {/* Stock Flow */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground block">
                            Letzte Inv.
                          </span>
                          <span className="font-medium">
                            {item.lastInventoryStock}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">
                            Verkauft
                          </span>
                          <span className="font-medium text-red-600">
                            −{item.soldSince}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">
                            Preis
                          </span>
                          <span className="font-medium">
                            €{item.currentPrice.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Input Fields */}
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            Eingekauft
                          </label>
                          <div className="flex items-center gap-2">
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
                              className={`h-8 ${
                                purchaseValue > 0 ? "border-green-500" : ""
                              }`}
                              min="0"
                              placeholder="0"
                              disabled={isSaving || isQuickSaving}
                            />
                            {purchaseValue > 0 && (
                              <span className="text-green-600 font-bold text-sm">
                                +{purchaseValue}
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">
                            Ist-Bestand
                          </label>
                          <Input
                            type="number"
                            value={actualStock}
                            onChange={(e) => {
                              const value =
                                e.target.value === ""
                                  ? 0
                                  : Number(e.target.value);
                              handleCountedStockInput(item.drinkId, value);
                            }}
                            className="h-8"
                            min="0"
                            disabled={isSaving || isQuickSaving}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Inventory Confirmation Dialog */}
      <Dialog open={showInventoryDialog} onOpenChange={setShowInventoryDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vollständige Inventur erstellen</DialogTitle>
            <DialogDescription>
              Die Inventur wird mit den aktuellen Bestandszahlen erstellt.
              {totalSoldUnits > 0 && (
                <span className="block mt-2">
                  Es wurden <strong>{totalSoldUnits} Flaschen</strong> seit der
                  letzten Inventur verkauft.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center space-x-2 py-4">
            <Checkbox
              id="create-invoice"
              checked={createInvoice}
              onCheckedChange={(checked) =>
                setCreateInvoice(checked as boolean)
              }
            />
            <Label
              htmlFor="create-invoice"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Auch Rechnung erstellen
            </Label>
          </div>

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowInventoryDialog(false)}
            >
              Abbrechen
            </Button>
            <Button
              onClick={() => handleCreateInventory(createInvoice)}
              disabled={isSaving}
            >
              {isSaving ? (
                "Erstelle..."
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Inventur erstellen
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
