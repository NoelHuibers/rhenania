"use client";

import {
  AlertCircle,
  ArrowLeft,
  History,
  Minus,
  Package,
  Plus,
  Save,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";
import { calculateInventoryData } from "~/lib/inventory-calculations";
import { ProductStorage, StockAdjustmentStorage } from "~/lib/storage";
import type { InventoryItem } from "~/lib/types";

interface StockAdjustmentInterfaceProps {
  onBack: () => void;
}

interface AdjustmentEntry {
  productId: string;
  adjustmentQuantity: string;
  reason: string;
  notes: string;
}

const ADJUSTMENT_REASONS = [
  "Damaged goods",
  "Theft/Loss",
  "Expired products",
  "Inventory correction",
  "Supplier return",
  "Customer return",
  "Transfer out",
  "Transfer in",
  "Other",
];

export function StockAdjustmentInterface({
  onBack,
}: StockAdjustmentInterfaceProps) {
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [adjustmentEntry, setAdjustmentEntry] = useState<AdjustmentEntry>({
    productId: "",
    adjustmentQuantity: "",
    reason: "",
    notes: "",
  });
  const [recentAdjustments, setRecentAdjustments] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const data = calculateInventoryData();
    setInventoryData(data);

    // Load recent adjustments
    const adjustments = StockAdjustmentStorage.getAll()
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      .slice(0, 10);

    const adjustmentsWithProducts = adjustments.map((adj) => {
      const product = ProductStorage.getAll().find(
        (p) => p.id === adj.product_id
      );
      return { ...adj, product };
    });

    setRecentAdjustments(adjustmentsWithProducts);
  }, []);

  const handleProductSelect = (productId: string) => {
    setSelectedProduct(productId);
    setAdjustmentEntry({
      productId,
      adjustmentQuantity: "",
      reason: "",
      notes: "",
    });
  };

  const handleSaveAdjustment = async () => {
    if (
      !adjustmentEntry.productId ||
      !adjustmentEntry.adjustmentQuantity ||
      !adjustmentEntry.reason
    ) {
      // toast({
      //   title: "Missing Information",
      //   description: "Please fill in all required fields.",
      //   variant: "destructive",
      // });
      return;
    }

    const quantity = Number.parseFloat(adjustmentEntry.adjustmentQuantity);
    if (isNaN(quantity)) {
      // toast({
      //   title: "Invalid Quantity",
      //   description: "Please enter a valid number for the adjustment quantity.",
      //   variant: "destructive",
      // });
      return;
    }

    setIsSaving(true);

    try {
      const adjustmentDate = new Date().toISOString().split("T")[0]!;

      StockAdjustmentStorage.add({
        product_id: adjustmentEntry.productId,
        adjustment_quantity: quantity,
        reason: adjustmentEntry.reason,
        adjustment_date: adjustmentDate,
      });

      // toast({
      //   title: "Adjustment Saved",
      //   description: `Stock adjustment of ${
      //     quantity > 0 ? "+" : ""
      //   }${quantity} has been recorded.`,
      // });

      // Reset form
      setAdjustmentEntry({
        productId: "",
        adjustmentQuantity: "",
        reason: "",
        notes: "",
      });
      setSelectedProduct("");

      // Refresh data
      const updatedData = calculateInventoryData();
      setInventoryData(updatedData);

      // Refresh recent adjustments
      const adjustments = StockAdjustmentStorage.getAll()
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        .slice(0, 10);

      const adjustmentsWithProducts = adjustments.map((adj) => {
        const product = ProductStorage.getAll().find(
          (p) => p.id === adj.product_id
        );
        return { ...adj, product };
      });

      setRecentAdjustments(adjustmentsWithProducts);
    } catch (error) {
      // toast({
      //   title: "Error",
      //   description: "Failed to save stock adjustment. Please try again.",
      //   variant: "destructive",
      // });
    } finally {
      setIsSaving(false);
    }
  };

  const selectedProductData = inventoryData.find(
    (item) => item.product.id === selectedProduct
  );

  const getAdjustmentTypeIcon = (quantity: number) => {
    return quantity > 0 ? (
      <Plus className="h-4 w-4 text-green-600" />
    ) : (
      <Minus className="h-4 w-4 text-red-600" />
    );
  };

  const getAdjustmentTypeBadge = (quantity: number) => {
    return quantity > 0 ? (
      <Badge variant="secondary" className="text-green-700 bg-green-100">
        +{quantity}
      </Badge>
    ) : (
      <Badge variant="secondary" className="text-red-700 bg-red-100">
        {quantity}
      </Badge>
    );
  };

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
              <h1 className="text-xl font-bold">Stock Adjustments</h1>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Adjustment Date: {new Date().toLocaleDateString()}
          </div>
        </div>
      </header>

      <div className="container px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Adjustment Form */}
          <div className="space-y-6">
            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Instructions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <p>• Select a product to adjust its stock level</p>
                  <p>
                    • Enter positive numbers to increase stock, negative to
                    decrease
                  </p>
                  <p>• Choose an appropriate reason for the adjustment</p>
                  <p>• Add notes for additional context if needed</p>
                </div>
              </CardContent>
            </Card>

            {/* Product Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Select Product</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="product-select">Product</Label>
                  <Select
                    value={selectedProduct}
                    onValueChange={handleProductSelect}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a product to adjust..." />
                    </SelectTrigger>
                    <SelectContent>
                      {inventoryData.map((item) => (
                        <SelectItem
                          key={item.product.id}
                          value={item.product.id}
                        >
                          {item.product.name} - {item.product.category}{" "}
                          (Current: {item.theoretical_stock})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedProductData && (
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-medium mb-2">
                      {selectedProductData.product.name}
                    </h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Category:</span>
                        <div>{selectedProductData.product.category}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Current Stock:
                        </span>
                        <div className="font-medium">
                          {selectedProductData.theoretical_stock}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Unit:</span>
                        <div>{selectedProductData.product.unit}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">
                          Cost per Unit:
                        </span>
                        <div>
                          $
                          {selectedProductData.product.cost_per_unit.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Adjustment Details */}
            {selectedProduct && (
              <Card>
                <CardHeader>
                  <CardTitle>Adjustment Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="quantity">Adjustment Quantity *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      step="1"
                      value={adjustmentEntry.adjustmentQuantity}
                      onChange={(e) =>
                        setAdjustmentEntry({
                          ...adjustmentEntry,
                          adjustmentQuantity: e.target.value,
                        })
                      }
                      placeholder="Enter positive or negative number"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Use positive numbers to increase stock, negative to
                      decrease
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="reason">Reason *</Label>
                    <Select
                      value={adjustmentEntry.reason}
                      onValueChange={(value) =>
                        setAdjustmentEntry({
                          ...adjustmentEntry,
                          reason: value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a reason..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ADJUSTMENT_REASONS.map((reason) => (
                          <SelectItem key={reason} value={reason}>
                            {reason}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea
                      id="notes"
                      value={adjustmentEntry.notes}
                      onChange={(e) =>
                        setAdjustmentEntry({
                          ...adjustmentEntry,
                          notes: e.target.value,
                        })
                      }
                      placeholder="Add any additional context..."
                      rows={3}
                    />
                  </div>

                  {adjustmentEntry.adjustmentQuantity &&
                    selectedProductData && (
                      <div className="p-4 bg-muted rounded-lg">
                        <h4 className="font-medium mb-2">Preview</h4>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span>Current Stock:</span>
                            <span>{selectedProductData.theoretical_stock}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Adjustment:</span>
                            <span
                              className={
                                Number.parseFloat(
                                  adjustmentEntry.adjustmentQuantity
                                ) > 0
                                  ? "text-green-600"
                                  : "text-red-600"
                              }
                            >
                              {Number.parseFloat(
                                adjustmentEntry.adjustmentQuantity
                              ) > 0
                                ? "+"
                                : ""}
                              {adjustmentEntry.adjustmentQuantity}
                            </span>
                          </div>
                          <div className="flex justify-between font-medium border-t pt-1">
                            <span>New Stock:</span>
                            <span>
                              {selectedProductData.theoretical_stock +
                                Number.parseFloat(
                                  adjustmentEntry.adjustmentQuantity
                                )}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                  <Button
                    onClick={handleSaveAdjustment}
                    disabled={isSaving}
                    className="w-full gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {isSaving ? "Saving..." : "Save Adjustment"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Recent Adjustments */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Recent Adjustments
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentAdjustments.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Adjustment</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentAdjustments.map((adjustment) => (
                          <TableRow key={adjustment.id}>
                            <TableCell className="font-medium">
                              {adjustment.product?.name || "Unknown Product"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getAdjustmentTypeIcon(
                                  adjustment.adjustment_quantity
                                )}
                                {getAdjustmentTypeBadge(
                                  adjustment.adjustment_quantity
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">
                              {adjustment.reason}
                            </TableCell>
                            <TableCell className="text-sm">
                              {new Date(
                                adjustment.adjustment_date
                              ).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No adjustments recorded yet</p>
                    <p className="text-sm">
                      Stock adjustments will appear here once you start making
                      them
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
