// StockTracker.tsx
"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  getInventoryHistory,
  getStockData,
} from "~/server/actions/inventur/inventur";
import { SiteHeader } from "../trinken/SiteHeader";
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

  const handleInventorySaved = async () => {
    // Fetch fresh data after saving
    const [newStockData, newHistory] = await Promise.all([
      getStockData(),
      getInventoryHistory(),
    ]);
    setStockItems(newStockData);
    setHistory(newHistory);
  };

  return (
    <>
      <SiteHeader title="Inventur" />
      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Tabs defaultValue="dashboard" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dashboard">Übersicht</TabsTrigger>
              <TabsTrigger value="history">Verlauf</TabsTrigger>
            </TabsList>
            <TabsContent value="dashboard">
              <DashboardTab
                stockItems={stockItems}
                onInventorySaved={handleInventorySaved}
              />
            </TabsContent>
            <TabsContent value="history">
              <HistoryTab history={history} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
