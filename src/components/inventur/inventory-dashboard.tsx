"use client";

import {
  AlertTriangle,
  Clipboard,
  DollarSign,
  Download,
  Filter,
  Package,
  Printer,
  Search,
  Settings,
  TrendingDown,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { exportToCSV, printInventoryReport } from "~/lib/export-utils";
import { calculateInventoryData } from "~/lib/inventory-calculations";
import type { InventoryFilters, InventoryItem } from "~/lib/types";

interface InventoryDashboardProps {
  onNavigateToCount: () => void;
  onNavigateToAdjustments: () => void;
}

interface AdvancedFilters {
  stockStatus: string[];
  lossLevel: string[];
  dateRange: {
    from: string;
    to: string;
  };
}

export function InventoryDashboard({
  onNavigateToCount,
  onNavigateToAdjustments,
}: InventoryDashboardProps) {
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([]);
  const [filteredData, setFilteredData] = useState<InventoryItem[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filters, setFilters] = useState<InventoryFilters>({
    search: "",
    sortBy: "name",
    sortOrder: "asc",
  });
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({
    stockStatus: [],
    lossLevel: [],
    dateRange: { from: "", to: "" },
  });

  // Load and calculate inventory data
  useEffect(() => {
    const data = calculateInventoryData();
    setInventoryData(data);
    setFilteredData(data);
  }, []);

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...inventoryData];

    // Apply search filter
    if (filters.search) {
      filtered = filtered.filter(
        (item) =>
          item.product.name
            .toLowerCase()
            .includes(filters.search!.toLowerCase()) ||
          item.product.category
            .toLowerCase()
            .includes(filters.search!.toLowerCase())
      );
    }

    // Apply category filter
    if (filters.category) {
      filtered = filtered.filter(
        (item) => item.product.category === filters.category
      );
    }

    if (advancedFilters.stockStatus.length > 0) {
      filtered = filtered.filter((item) => {
        const status = getStockStatus(item).label;
        return advancedFilters.stockStatus.includes(status);
      });
    }

    if (advancedFilters.lossLevel.length > 0) {
      filtered = filtered.filter((item) => {
        const lossStatus = getLossStatus(item.loss_percentage).label;
        return advancedFilters.lossLevel.includes(lossStatus);
      });
    }

    if (advancedFilters.dateRange.from || advancedFilters.dateRange.to) {
      filtered = filtered.filter((item) => {
        if (!item.last_count_date) return false;
        const countDate = new Date(item.last_count_date);
        const fromDate = advancedFilters.dateRange.from
          ? new Date(advancedFilters.dateRange.from)
          : null;
        const toDate = advancedFilters.dateRange.to
          ? new Date(advancedFilters.dateRange.to)
          : null;

        if (fromDate && countDate < fromDate) return false;
        if (toDate && countDate > toDate) return false;
        return true;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (filters.sortBy) {
        case "name":
          aValue = a.product.name;
          bValue = b.product.name;
          break;
        case "category":
          aValue = a.product.category;
          bValue = b.product.category;
          break;
        case "theoretical_stock":
          aValue = a.theoretical_stock;
          bValue = b.theoretical_stock;
          break;
        case "loss_percentage":
          aValue = a.loss_percentage;
          bValue = b.loss_percentage;
          break;
        default:
          aValue = a.product.name;
          bValue = b.product.name;
      }

      if (typeof aValue === "string") {
        return filters.sortOrder === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return filters.sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    });

    setFilteredData(filtered);
  }, [inventoryData, filters, advancedFilters]);

  // Calculate summary metrics
  const totalProducts = inventoryData.length;
  const totalStockValue = inventoryData.reduce(
    (sum, item) => sum + item.theoretical_stock * item.product.cost_per_unit,
    0
  );
  const totalLossValue = inventoryData.reduce(
    (sum, item) => sum + item.loss_quantity * item.product.cost_per_unit,
    0
  );
  const averageLossPercentage =
    inventoryData.length > 0
      ? inventoryData.reduce((sum, item) => sum + item.loss_percentage, 0) /
        inventoryData.length
      : 0;

  const categories = Array.from(
    new Set(inventoryData.map((item) => item.product.category))
  );

  const getStockStatus = (item: InventoryItem) => {
    if (item.theoretical_stock <= 0)
      return { label: "Out of Stock", variant: "destructive" as const };
    if (item.theoretical_stock <= 10)
      return { label: "Low Stock", variant: "secondary" as const };
    return { label: "In Stock", variant: "default" as const };
  };

  const getLossStatus = (lossPercentage: number) => {
    if (lossPercentage > 10)
      return { label: "High Loss", variant: "destructive" as const };
    if (lossPercentage > 5)
      return { label: "Medium Loss", variant: "secondary" as const };
    if (lossPercentage > 0)
      return { label: "Low Loss", variant: "outline" as const };
    return { label: "No Loss", variant: "default" as const };
  };

  const handleStockStatusChange = (status: string, checked: boolean) => {
    setAdvancedFilters((prev) => ({
      ...prev,
      stockStatus: checked
        ? [...prev.stockStatus, status]
        : prev.stockStatus.filter((s) => s !== status),
    }));
  };

  const handleLossLevelChange = (level: string, checked: boolean) => {
    setAdvancedFilters((prev) => ({
      ...prev,
      lossLevel: checked
        ? [...prev.lossLevel, level]
        : prev.lossLevel.filter((l) => l !== level),
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      search: "",
      sortBy: "name",
      sortOrder: "asc",
    });
    setAdvancedFilters({
      stockStatus: [],
      lossLevel: [],
      dateRange: { from: "", to: "" },
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.category ||
    advancedFilters.stockStatus.length > 0 ||
    advancedFilters.lossLevel.length > 0 ||
    advancedFilters.dateRange.from ||
    advancedFilters.dateRange.to;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">Beverage Inventory</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(filteredData)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => printInventoryReport(filteredData)}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              Print Report
            </Button>
            <Button
              variant="outline"
              onClick={onNavigateToAdjustments}
              className="gap-2 bg-transparent"
            >
              <Settings className="h-4 w-4" />
              Stock Adjustments
            </Button>
            <Button onClick={onNavigateToCount} className="gap-2">
              <Clipboard className="h-4 w-4" />
              Take Inventory Count
            </Button>
            <div className="text-sm text-muted-foreground">
              Last updated: {new Date().toLocaleDateString()}
            </div>
          </div>
        </div>
      </header>

      <div className="container px-6 py-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Products
              </CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProducts}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Stock Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${totalStockValue.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Loss Value
              </CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                ${totalLossValue.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Loss %</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">
                {averageLossPercentage.toFixed(1)}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Filters */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Filters</CardTitle>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Clear All
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  className="gap-2"
                >
                  <Filter className="h-4 w-4" />
                  {showAdvancedFilters ? "Hide" : "Show"} Advanced
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Basic Filters */}
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={filters.search}
                    onChange={(e) =>
                      setFilters({ ...filters, search: e.target.value })
                    }
                    className="pl-10"
                  />
                </div>

                <Select
                  value={filters.category || "all"}
                  onValueChange={(value) =>
                    setFilters({
                      ...filters,
                      category: value === "all" ? undefined : value,
                    })
                  }
                >
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={filters.sortBy}
                  onValueChange={(value: any) =>
                    setFilters({ ...filters, sortBy: value })
                  }
                >
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Sort by Name</SelectItem>
                    <SelectItem value="category">Sort by Category</SelectItem>
                    <SelectItem value="theoretical_stock">
                      Sort by Stock
                    </SelectItem>
                    <SelectItem value="loss_percentage">
                      Sort by Loss %
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  onClick={() =>
                    setFilters({
                      ...filters,
                      sortOrder: filters.sortOrder === "asc" ? "desc" : "asc",
                    })
                  }
                >
                  {filters.sortOrder === "asc" ? "↑" : "↓"}
                </Button>
              </div>

              {showAdvancedFilters && (
                <>
                  <Separator />
                  <div className="grid gap-6 md:grid-cols-3">
                    {/* Stock Status Filter */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">
                        Stock Status
                      </Label>
                      <div className="space-y-2">
                        {["In Stock", "Low Stock", "Out of Stock"].map(
                          (status) => (
                            <div
                              key={status}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                id={`stock-${status}`}
                                checked={advancedFilters.stockStatus.includes(
                                  status
                                )}
                                onCheckedChange={(checked) =>
                                  handleStockStatusChange(status, !!checked)
                                }
                              />
                              <Label
                                htmlFor={`stock-${status}`}
                                className="text-sm"
                              >
                                {status}
                              </Label>
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {/* Loss Level Filter */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Loss Level</Label>
                      <div className="space-y-2">
                        {[
                          "No Loss",
                          "Low Loss",
                          "Medium Loss",
                          "High Loss",
                        ].map((level) => (
                          <div
                            key={level}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={`loss-${level}`}
                              checked={advancedFilters.lossLevel.includes(
                                level
                              )}
                              onCheckedChange={(checked) =>
                                handleLossLevelChange(level, !!checked)
                              }
                            />
                            <Label
                              htmlFor={`loss-${level}`}
                              className="text-sm"
                            >
                              {level}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Date Range Filter */}
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">
                        Last Count Date Range
                      </Label>
                      <div className="space-y-2">
                        <Input
                          type="date"
                          value={advancedFilters.dateRange.from}
                          onChange={(e) =>
                            setAdvancedFilters((prev) => ({
                              ...prev,
                              dateRange: {
                                ...prev.dateRange,
                                from: e.target.value,
                              },
                            }))
                          }
                          placeholder="From date"
                        />
                        <Input
                          type="date"
                          value={advancedFilters.dateRange.to}
                          onChange={(e) =>
                            setAdvancedFilters((prev) => ({
                              ...prev,
                              dateRange: {
                                ...prev.dateRange,
                                to: e.target.value,
                              },
                            }))
                          }
                          placeholder="To date"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {hasActiveFilters && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">
                Showing {filteredData.length} of {inventoryData.length} products
                {filters.search && ` matching "${filters.search}"`}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Inventory Table */}
        <Card>
          <CardHeader>
            <CardTitle>Inventory Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Purchased</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Theoretical</TableHead>
                    <TableHead className="text-right">Last Count</TableHead>
                    <TableHead className="text-right">Loss Qty</TableHead>
                    <TableHead className="text-right">Loss %</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item) => {
                    const stockStatus = getStockStatus(item);
                    const lossStatus = getLossStatus(item.loss_percentage);

                    return (
                      <TableRow key={item.product.id}>
                        <TableCell className="font-medium">
                          {item.product.name}
                        </TableCell>
                        <TableCell>{item.product.category}</TableCell>
                        <TableCell className="text-right">
                          {item.opening_stock}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.total_purchased}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.total_sold}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {item.theoretical_stock}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.last_count_quantity !== null
                            ? item.last_count_quantity
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.loss_quantity !== 0 ? (
                            <span className="text-destructive font-medium">
                              {item.loss_quantity}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.loss_percentage > 0 ? (
                            <span className="text-destructive font-medium">
                              {item.loss_percentage.toFixed(1)}%
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Badge variant={stockStatus.variant}>
                              {stockStatus.label}
                            </Badge>
                            {item.loss_percentage > 0 && (
                              <Badge variant={lossStatus.variant}>
                                {lossStatus.label}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
