"use client";

import { Save } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  getInventoryHistory,
  getStockData,
  saveInventoryCount,
} from "~/server/actions/inventur/inventur";
import { SiteHeader } from "../trinken/SiteHeader";
import AdjustmentsTab from "./AdjustmentTab";
import CountTab from "./CountTab";
import DashboardTab from "./DashboardTab";
import HistoryTab from "./HistoryTab";
import type { InventoryWithItems, StockStatusWithDetails } from "./utils";

interface StockTrackerProps {
  initialData: StockStatusWithDetails[];
  initialHistory: InventoryWithItems[];
}

export default function StockTracker({
  initialData,
  initialHistory,
}: StockTrackerProps) {
  const [stockItems, setStockItems] = useState(initialData);
  const [history, setHistory] = useState(initialHistory);
  const [countedStock, setCountedStock] = useState<{ [key: string]: number }>(
    {}
  );
  const [isPending, startTransition] = useTransition();

  const handleSaveInventory = () => {
    startTransition(async () => {
      try {
        const inventoryItems = stockItems.map((item) => ({
          drinkId: item.drinkId,
          countedStock: countedStock[item.drinkId] ?? item.istStock,
        }));

        const result = await saveInventoryCount(inventoryItems);

        if (result.success) {
          toast.success("Inventory saved successfully");

          const [newStockData, newHistory] = await Promise.all([
            getStockData(),
            getInventoryHistory(),
          ]);

          setStockItems(newStockData);
          setHistory(newHistory);
          setCountedStock({});
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save inventory"
        );
      }
    });
  };

  return (
    <>
      <SiteHeader title="Inventur" />
      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <Button
              onClick={handleSaveInventory}
              disabled={isPending}
              className="bg-secondary hover:bg-secondary/90"
            >
              <Save className="h-4 w-4 mr-2" />
              {isPending ? "Saving..." : "Save Inventory"}
            </Button>
          </div>

          <Tabs defaultValue="dashboard" className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
              <TabsTrigger value="count">Count</TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard">
              <DashboardTab
                stockItems={stockItems}
                countedStock={countedStock}
              />
            </TabsContent>

            <TabsContent value="history">
              <HistoryTab history={history} />
            </TabsContent>

            <TabsContent value="adjustments">
              <AdjustmentsTab
                stockItems={stockItems}
                onAdjustmentsApplied={async () => {
                  const newStockData = await getStockData();
                  setStockItems(newStockData);
                }}
              />
            </TabsContent>

            <TabsContent value="count">
              <CountTab
                stockItems={stockItems}
                countedStock={countedStock}
                onUpdateStock={(drinkId, value) => {
                  setCountedStock((prev) => ({ ...prev, [drinkId]: value }));
                }}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
