"use client";

import { Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "~/components/rechnungen/BillingTable";
import { TabContent } from "~/components/rechnungen/TabContent";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  createNewBilling,
  getAllBillPeriods,
  getBillsForPeriod,
  getLatestBillPeriod,
  updateBillStatus,
} from "~/server/actions/billings";
import { getCurrentOrders } from "~/server/actions/currentOrders";

// Types
export interface DrinkItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface BillingEntry {
  id: string;
  name: string;
  totalDue: number;
  status?: "Bezahlt" | "Unbezahlt" | "Gestundet";
  items: DrinkItem[];
}

// Main Dashboard Component
export default function BillingDashboard() {
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [activeTab, setActiveTab] = useState("current-orders");

  // State for current orders
  const [currentOrders, setCurrentOrders] = useState<BillingEntry[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // State for current billing
  const [currentBilling, setCurrentBilling] = useState<BillingEntry[]>([]);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [currentBillPeriod, setCurrentBillPeriod] = useState<any>(null);

  // State for all bill periods
  const [allBillPeriods, setAllBillPeriods] = useState<any[]>([]);
  const [billPeriodsData, setBillPeriodsData] = useState<
    Map<string, BillingEntry[]>
  >(new Map());

  // Load current orders on component mount
  useEffect(() => {
    const fetchCurrentOrders = async () => {
      try {
        setIsLoadingOrders(true);
        setOrdersError(null);
        const orders = await getCurrentOrders();
        setCurrentOrders(orders);
      } catch (err) {
        setOrdersError("Fehler beim Laden der aktuellen Bestellungen");
        console.error("Fehler beim Abrufen der aktuellen Bestellungen:", err);
      } finally {
        setIsLoadingOrders(false);
      }
    };

    fetchCurrentOrders();
  }, []);

  // Load current billing when tab is switched or component mounts
  useEffect(() => {
    const fetchAllBillPeriods = async () => {
      try {
        const periods = await getAllBillPeriods();
        setAllBillPeriods(periods);
      } catch (err) {
        console.error("Error fetching bill periods:", err);
      }
    };

    fetchAllBillPeriods();
  }, []);

  useEffect(() => {
    if (activeTab === "current-billing") {
      const fetchCurrentBilling = async () => {
        try {
          setIsLoadingBilling(true);
          setBillingError(null);

          const latestPeriod = await getLatestBillPeriod();
          if (latestPeriod) {
            setCurrentBillPeriod(latestPeriod);
            const bills = await getBillsForPeriod(latestPeriod.id);
            setCurrentBilling(bills);
          } else {
            setCurrentBilling([]);
            setCurrentBillPeriod(null);
          }
        } catch (err) {
          setBillingError("Fehler beim Laden der aktuellen Abrechnungen");
          console.error("Fehler beim Abrufen der aktuellen Abrechnungen:", err);
        } finally {
          setIsLoadingBilling(false);
        }
      };

      fetchCurrentBilling();
    } else {
      // Load data for historical periods
      const periodId = activeTab;
      const period = allBillPeriods.find((p) => p.id === periodId);

      if (period && !billPeriodsData.has(periodId)) {
        const fetchPeriodData = async () => {
          try {
            const bills = await getBillsForPeriod(periodId);
            setBillPeriodsData((prev) => new Map(prev.set(periodId, bills)));
          } catch (err) {
            console.error(`Error fetching data for period ${periodId}:`, err);
          }
        };

        fetchPeriodData();
      }
    }
  }, [activeTab, allBillPeriods]);

  const handleCreateReport = async () => {
    setIsCreatingReport(true);
    try {
      const result = await createNewBilling();
      if (result.success) {
        console.log(
          `${result.billsCreated} bills created for €${result.totalAmount}`
        );
        const orders = await getCurrentOrders();
        setCurrentOrders(orders);
      } else {
        console.error("Billing failed:", result.message);
      }
    } catch (error) {
      console.error("Error during billing:", error);
    } finally {
      setIsCreatingReport(false);
    }
  };

  const handleStatusChange = async (
    entryId: string,
    newStatus: BillingEntry["status"]
  ) => {
    // Store the original status for potential rollback
    const originalEntry = currentBilling.find((entry) => entry.id === entryId);
    const originalStatus = originalEntry?.status;

    try {
      setCurrentBilling((prev) =>
        prev.map((entry) =>
          entry.id === entryId ? { ...entry, status: newStatus } : entry
        )
      );

      if (
        newStatus === "Bezahlt" ||
        newStatus === "Unbezahlt" ||
        newStatus === "Gestundet"
      ) {
        const result = await updateBillStatus(entryId, newStatus);

        if (result.success) {
          console.log(
            `Status successfully changed for ${entryId} to ${newStatus}`
          );
          // Optionally update other related state like paidAt timestamp
          if (newStatus === "Bezahlt") {
            setCurrentBilling((prev) =>
              prev.map((entry) =>
                entry.id === entryId
                  ? { ...entry, status: newStatus, paidAt: new Date() }
                  : entry
              )
            );
          } else if (newStatus === "Unbezahlt" || newStatus === "Gestundet") {
            setCurrentBilling((prev) =>
              prev.map((entry) =>
                entry.id === entryId
                  ? { ...entry, status: newStatus, paidAt: null }
                  : entry
              )
            );
          }
        } else {
          setCurrentBilling((prev) =>
            prev.map((entry) =>
              entry.id === entryId
                ? { ...entry, status: originalStatus }
                : entry
            )
          );
          console.error(`Failed to update status for ${entryId}`);
          toast.error("Failed to update bill status");
        }
      } else {
        console.error("Invalid status value provided to updateBillStatus");
        toast.error("Ungültiger Statuswert");
      }
    } catch (error) {
      // Revert the optimistic update on error
      setCurrentBilling((prev) =>
        prev.map((entry) =>
          entry.id === entryId ? { ...entry, status: originalStatus } : entry
        )
      );
      console.error("Error updating status:", error);
      toast.error("An error occurred while updating the bill status");
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rechnungen</h1>
          <p className="text-muted-foreground">
            Rechnungen für Ihre Getränkebestellungen verwalten und verfolgen
          </p>
        </div>
        <Button
          onClick={handleCreateReport}
          disabled={isCreatingReport}
          className="w-full sm:w-auto"
        >
          {isCreatingReport ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Erstelle Bericht...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Neue Rechnung
            </>
          )}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto">
          <TabsTrigger value="current-orders" className="text-sm">
            Aktuelle Bestellungen
          </TabsTrigger>
          <TabsTrigger value="current-billing" className="text-sm">
            Aktuelle Abrechnungen
          </TabsTrigger>
          {allBillPeriods.map((period) => (
            <TabsTrigger key={period.id} value={period.id} className="text-sm">
              Rechnung {period.billNumber}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="current-orders" className="space-y-4">
          <TabContent
            entries={currentOrders}
            isLoading={isLoadingOrders}
            error={ordersError}
            cardTitle="Aktuelle Bestellungen"
            cardDescription="Laufende Bestellungen, die noch nicht abgerechnet wurden"
            emptyMessage="Keine aktuellen Bestellungen gefunden"
          />
        </TabsContent>

        <TabsContent value="current-billing" className="space-y-4">
          <TabContent
            entries={currentBilling}
            isLoading={isLoadingBilling}
            error={billingError}
            cardTitle="Aktuelle Abrechnungsperiode"
            cardDescription={
              currentBillPeriod
                ? `Rechnung ${
                    currentBillPeriod.billNumber
                  } - Gesamtbetrag: ${formatCurrency(
                    currentBillPeriod.totalAmount
                  )}`
                : "Zusammenfassung der aktuellen Abrechnungsperiode"
            }
            headerDate={
              currentBillPeriod?.createdAt
                ? new Date(currentBillPeriod.createdAt).toLocaleDateString(
                    "de-DE"
                  )
                : undefined
            }
            showStatus={true}
            emptyMessage="Keine aktuellen Abrechnungen gefunden"
            onStatusChange={handleStatusChange}
          />
        </TabsContent>

        {allBillPeriods.map((period) => {
          const periodEntries = billPeriodsData.get(period.id) || [];
          const isLoadingPeriod = !billPeriodsData.has(period.id);

          return (
            <TabsContent
              key={period.id}
              value={period.id}
              className="space-y-4"
            >
              <TabContent
                entries={periodEntries}
                isLoading={isLoadingPeriod}
                error={null}
                cardTitle={`Rechnung ${period.billNumber}`}
                cardDescription={`Abrechnungsbericht - Gesamtbetrag: ${formatCurrency(
                  period.totalAmount
                )}`}
                headerDate={new Date(period.createdAt).toLocaleDateString(
                  "de-DE"
                )}
                showStatus={true}
                emptyMessage="Keine Abrechnungen in dieser Periode gefunden"
                onStatusChange={handleStatusChange}
              />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
