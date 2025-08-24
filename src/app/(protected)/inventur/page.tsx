"use client";

import { useEffect, useState } from "react";
import { InventoryCountInterface } from "~/components/inventur/inventory-count-interface";
import { InventoryDashboard } from "~/components/inventur/inventory-dashboard";
import { StockAdjustmentInterface } from "~/components/inventur/stock-adjustment-interface";
import { initializeSampleData } from "~/lib/inventory-calculations";

type View = "dashboard" | "count" | "adjustments";

export default function HomePage() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Initialize sample data on first load
    initializeSampleData();
    setIsInitialized(true);
  }, []);

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading inventory data...</div>
      </div>
    );
  }

  if (currentView === "count") {
    return (
      <InventoryCountInterface onBack={() => setCurrentView("dashboard")} />
    );
  }

  if (currentView === "adjustments") {
    return (
      <StockAdjustmentInterface onBack={() => setCurrentView("dashboard")} />
    );
  }

  return (
    <InventoryDashboard
      onNavigateToCount={() => setCurrentView("count")}
      onNavigateToAdjustments={() => setCurrentView("adjustments")}
    />
  );
}
