"use client";

import { AlertCircle, ArrowLeft, Package, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { calculateInventoryData } from "~/lib/inventory-calculations";
import { InventoryCountStorage } from "~/lib/storage";
import type { InventoryItem } from "~/lib/types";

interface CountEntry {
  productId: string;
  actualQuantity: string;
  notes: string;
}

interface InventoryCountInterfaceProps {
  onBack: () => void;
}

export function InventoryCountInterface({
  onBack,
}: InventoryCountInterfaceProps) {
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([]);
  const [countEntries, setCountEntries] = useState<Record<string, CountEntry>>(
    {}
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const data = calculateInventoryData();
    setInventoryData(data);

    // Initialize count entries
    const initialEntries: Record<string, CountEntry> = {};
    data.forEach((item) => {
      initialEntries[item.product.id] = {
        productId: item.product.id.toString(),
        actualQuantity: item.last_count_quantity?.toString() || "",
        notes: "",
      };
    });
    setCountEntries(initialEntries);
  }, []);

  const updateCountEntry = (
    productId: string,
    field: keyof CountEntry,
    value: string
  ) => {
    setCountEntries((prev) => ({
      ...prev,
      [productId]: {
        productId,
        actualQuantity: "",
        notes: "",
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  const getVariance = (item: InventoryItem, actualQuantity: string) => {
    const actual = Number.parseFloat(actualQuantity) || 0;
    return actual - item.theoretical_stock;
  };

  const getVarianceStatus = (variance: number) => {
    if (variance === 0)
      return {
        label: "Match",
        variant: "default" as const,
        color: "text-green-600",
      };
    if (variance > 0)
      return {
        label: `+${variance}`,
        variant: "secondary" as const,
        color: "text-blue-600",
      };
    return {
      label: variance.toString(),
      variant: "destructive" as const,
      color: "text-red-600",
    };
  };

  const handleSaveAll = async () => {
    setIsSaving(true);

    try {
      const countDate = new Date().toISOString().split("T")[0];
      let savedCount = 0;

      // Save all entries that have actual quantities
      for (const entry of Object.values(countEntries)) {
        const actualQuantity = Number.parseFloat(entry.actualQuantity);

        if (!isNaN(actualQuantity) && actualQuantity >= 0) {
          InventoryCountStorage.add({
            product_id: entry.productId,
            actual_quantity: actualQuantity,
            count_date: countDate ? countDate : "",
            notes: entry.notes || undefined,
          });
          savedCount++;
        }
      }

      // toast({
      //   title: "Inventory Count Saved",
      //   description: `Successfully saved ${savedCount} inventory counts.`,
      // });

      // Refresh data to show updated calculations
      const updatedData = calculateInventoryData();
      setInventoryData(updatedData);
    } catch (error) {
      // toast({
      //   title: "Error",
      //   description: "Failed to save inventory counts. Please try again.",
      //   variant: "destructive",
      // });
    } finally {
      setIsSaving(false);
    }
  };

  const hasUnsavedChanges = Object.values(countEntries).some(
    (entry) =>
      entry.actualQuantity !== "" &&
      !isNaN(Number.parseFloat(entry.actualQuantity))
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <div className="flex items-center gap-2">
              <Package className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold">Inventory Count</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-muted-foreground">
              Count Date: {new Date().toLocaleDateString()}
            </div>
            <Button
              onClick={handleSaveAll}
              disabled={!hasUnsavedChanges || isSaving}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save All Counts"}
            </Button>
          </div>
        </div>
      </header>

      <div className="container px-6 py-6">
        {/* Instructions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Instructions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p>• Enter the actual quantity counted for each product</p>
              <p>
                • The variance column shows the difference between theoretical
                and actual stock
              </p>
              <p>• Add notes for any discrepancies or special circumstances</p>
              <p>
                • Click "Save All Counts" when finished to update your inventory
                records
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Count Table */}
        <Card>
          <CardHeader>
            <CardTitle>Physical Inventory Count</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">
                      Theoretical Stock
                    </TableHead>
                    <TableHead className="text-right">Last Count</TableHead>
                    <TableHead className="text-right">Actual Count</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryData.map((item) => {
                    const entry = countEntries[item.product.id];
                    const actualQuantity = entry?.actualQuantity || "";
                    const variance = actualQuantity
                      ? getVariance(item, actualQuantity)
                      : 0;
                    const varianceStatus = getVarianceStatus(variance);

                    return (
                      <TableRow key={item.product.id}>
                        <TableCell className="font-medium">
                          {item.product.name}
                        </TableCell>
                        <TableCell>{item.product.category}</TableCell>
                        <TableCell className="text-right font-medium">
                          {item.theoretical_stock}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.last_count_quantity !== null
                            ? item.last_count_quantity
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={actualQuantity}
                            onChange={(e) =>
                              updateCountEntry(
                                item.product.id,
                                "actualQuantity",
                                e.target.value
                              )
                            }
                            className="w-24 text-right"
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {actualQuantity &&
                          !isNaN(Number.parseFloat(actualQuantity)) ? (
                            <Badge
                              variant={varianceStatus.variant}
                              className={varianceStatus.color}
                            >
                              {varianceStatus.label}
                            </Badge>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={entry?.notes || ""}
                            onChange={(e) =>
                              updateCountEntry(
                                item.product.id,
                                "notes",
                                e.target.value
                              )
                            }
                            placeholder="Add notes..."
                            className="w-48"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {hasUnsavedChanges && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Count Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {
                      Object.values(countEntries).filter(
                        (e) =>
                          e.actualQuantity &&
                          !isNaN(Number.parseFloat(e.actualQuantity))
                      ).length
                    }
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Products Counted
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {
                      Object.values(countEntries).filter((e) => {
                        if (!e.actualQuantity) return false;
                        const item = inventoryData.find(
                          (i) => i.product.id === e.productId
                        );
                        return (
                          item && getVariance(item, e.actualQuantity) === 0
                        );
                      }).length
                    }
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Exact Matches
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {
                      Object.values(countEntries).filter((e) => {
                        if (!e.actualQuantity) return false;
                        const item = inventoryData.find(
                          (i) => i.product.id === e.productId
                        );
                        return (
                          item && getVariance(item, e.actualQuantity) !== 0
                        );
                      }).length
                    }
                  </div>
                  <div className="text-sm text-muted-foreground">Variances</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
