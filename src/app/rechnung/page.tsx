"use client";

import { Loader2, Plus } from "lucide-react";
import { useSession } from "next-auth/react";
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
import { getUserRoles } from "~/server/actions/userRoles";

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
  paidAt?: Date | null;
}

export default function BillingDashboard() {
  const { data: session, status } = useSession();
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [activeTab, setActiveTab] = useState("current-orders");

  const [userRoles, setUserRoles] = useState<string[]>([]);

  // State for current orders
  const [currentOrders, setCurrentOrders] = useState<BillingEntry[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // State for current billing
  const [currentBilling, setCurrentBilling] = useState<BillingEntry[]>([]);
  const [isLoadingBilling, setIsLoadingBilling] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [currentBillPeriod, setCurrentBillPeriod] = useState<any>(null);

  // State for previous billing
  const [previousBilling, setPreviousBilling] = useState<BillingEntry[]>([]);
  const [isLoadingPreviousBilling, setIsLoadingPreviousBilling] =
    useState(false);
  const [previousBillingError, setPreviousBillingError] = useState<
    string | null
  >(null);
  const [previousBillPeriod, setPreviousBillPeriod] = useState<any>(null);

  // State for all bill periods
  const [allBillPeriods, setAllBillPeriods] = useState<any[]>([]);
  const [billPeriodsData, setBillPeriodsData] = useState<
    Map<string, BillingEntry[]>
  >(new Map());

  const hasRequiredRole = () => {
    return userRoles.includes("Versorger");
  };

  const isAuthenticated = status === "authenticated" && session?.user?.id;

  useEffect(() => {
    const fetchUserRoles = async () => {
      if (!session?.user?.id) {
        setUserRoles([]);
        return;
      }

      try {
        const roles = await getUserRoles(session.user.id);

        if (!Array.isArray(roles)) {
          throw new Error("Invalid roles response");
        }

        setUserRoles(
          roles.map((role) => {
            if (typeof role?.name !== "string") {
              throw new Error("Invalid role structure");
            }
            return role.name;
          })
        );
      } catch (err) {
        console.error("Error fetching user roles:", err);
        setUserRoles([]);
        toast.error("Fehler beim Laden der Benutzerrollen");
      }
    };

    fetchUserRoles();
  }, [session?.user?.id]);

  useEffect(() => {
    const fetchCurrentOrders = async () => {
      if (!isAuthenticated) return;

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
  }, [isAuthenticated]);

  useEffect(() => {
    const fetchAllBillPeriods = async () => {
      if (!isAuthenticated) return;

      try {
        const periods = await getAllBillPeriods();
        const sortedPeriods = periods.sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setAllBillPeriods(sortedPeriods);
      } catch (err) {
        console.error("Error fetching bill periods:", err);
      }
    };

    fetchAllBillPeriods();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

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
    } else if (activeTab === "previous-billing") {
      const fetchPreviousBilling = async () => {
        try {
          setIsLoadingPreviousBilling(true);
          setPreviousBillingError(null);

          // Get the second most recent period (previous billing)
          if (allBillPeriods.length > 1) {
            const previousPeriod = allBillPeriods[1]; // Second in the sorted array
            setPreviousBillPeriod(previousPeriod);
            const bills = await getBillsForPeriod(previousPeriod.id);
            setPreviousBilling(bills);
          } else {
            setPreviousBilling([]);
            setPreviousBillPeriod(null);
          }
        } catch (err) {
          setPreviousBillingError("Fehler beim Laden der letzten Abrechnungen");
          console.error("Fehler beim Abrufen der letzten Abrechnungen:", err);
        } finally {
          setIsLoadingPreviousBilling(false);
        }
      };

      fetchPreviousBilling();
    } else if (activeTab === "older-bills") {
      // Load data for older periods (skip the first two periods)
      const olderPeriods = allBillPeriods.slice(2);

      olderPeriods.forEach((period) => {
        if (!billPeriodsData.has(period.id)) {
          const fetchPeriodData = async () => {
            try {
              const bills = await getBillsForPeriod(period.id);
              setBillPeriodsData((prev) => new Map(prev.set(period.id, bills)));
            } catch (err) {
              console.error(
                `Error fetching data for period ${period.id}:`,
                err
              );
            }
          };
          fetchPeriodData();
        }
      });
    }
  }, [activeTab, allBillPeriods, isAuthenticated]);

  const handleCreateReport = async () => {
    if (!isAuthenticated) {
      toast.error("Sie müssen angemeldet sein");
      return;
    }
    if (!hasRequiredRole()) {
      toast.error("Sie haben keine Berechtigung, neue Rechnungen zu erstellen");
      return;
    }

    setIsCreatingReport(true);
    try {
      const result = await createNewBilling();
      if (result?.success) {
        console.log(
          `${result.billsCreated} bills created for €${result.totalAmount}`
        );
        const orders = await getCurrentOrders();
        setCurrentOrders(orders);
        toast.success("Neue Rechnung erfolgreich erstellt");
      } else {
        console.error("Billing failed:", result?.message);
        toast.error("Fehler beim Erstellen der Rechnung");
      }
    } catch (error) {
      console.error("Error during billing:", error);
      toast.error("Fehler beim Erstellen der Rechnung");
    } finally {
      setIsCreatingReport(false);
    }
  };

  const handleStatusChange = async (
    entryId: string,
    newStatus: BillingEntry["status"]
  ) => {
    if (!isAuthenticated) {
      toast.error("Sie müssen angemeldet sein");
      return;
    }
    if (!hasRequiredRole()) {
      toast.error("Sie haben keine Berechtigung, den Status zu ändern");
      return;
    }
    if (!entryId || typeof entryId !== "string") {
      toast.error("Ungültige Eintrags-ID");
      return;
    }

    if (
      !newStatus ||
      !["Bezahlt", "Unbezahlt", "Gestundet"].includes(newStatus)
    ) {
      toast.error("Ungültiger Status");
      return;
    }

    const originalEntry = currentBilling.find((entry) => entry.id === entryId);
    const originalStatus = originalEntry?.status;

    try {
      setCurrentBilling((prev) =>
        prev.map((entry) =>
          entry.id === entryId ? { ...entry, status: newStatus } : entry
        )
      );

      const result = await updateBillStatus(entryId, newStatus);

      if (result?.success) {
        console.log(
          `Status successfully changed for ${entryId} to ${newStatus}`
        );
        toast.success("Status erfolgreich aktualisiert");

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
            entry.id === entryId ? { ...entry, status: originalStatus } : entry
          )
        );
        console.error(`Failed to update status for ${entryId}`);
        toast.error("Fehler beim Aktualisieren des Status");
      }
    } catch (error) {
      // Revert the optimistic update on error
      setCurrentBilling((prev) =>
        prev.map((entry) =>
          entry.id === entryId ? { ...entry, status: originalStatus } : entry
        )
      );
      console.error("Error updating status:", error);
      toast.error("Fehler beim Aktualisieren des Status");
    }
  };

  const olderPeriods = allBillPeriods.slice(2);

  // MAIN COMPONENT RENDER
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Getränkerechnungen
          </h1>
          <p className="text-muted-foreground">
            Übersicht über alle Rechnungen und Bestellungen
          </p>
        </div>
        {hasRequiredRole() && (
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
        )}
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
            Aktuelle Abrechnung
          </TabsTrigger>
          {allBillPeriods.length > 1 && (
            <TabsTrigger value="previous-billing" className="text-sm">
              Letzte Abrechnung
            </TabsTrigger>
          )}
          {olderPeriods.length > 0 && (
            <TabsTrigger value="older-bills" className="text-sm">
              Ältere Rechnungen
            </TabsTrigger>
          )}
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
            onStatusChange={hasRequiredRole() ? handleStatusChange : undefined}
            canEditStatus={hasRequiredRole()}
          />
        </TabsContent>

        <TabsContent value="previous-billing" className="space-y-4">
          <TabContent
            entries={previousBilling}
            isLoading={isLoadingPreviousBilling}
            error={previousBillingError}
            cardTitle="Letzte Abrechnungsperiode"
            cardDescription={
              previousBillPeriod
                ? `Rechnung ${
                    previousBillPeriod.billNumber
                  } - Gesamtbetrag: ${formatCurrency(
                    previousBillPeriod.totalAmount
                  )}`
                : "Zusammenfassung der letzten Abrechnungsperiode"
            }
            headerDate={
              previousBillPeriod?.createdAt
                ? new Date(previousBillPeriod.createdAt).toLocaleDateString(
                    "de-DE"
                  )
                : undefined
            }
            showStatus={true}
            emptyMessage="Keine vorherigen Abrechnungen gefunden"
            onStatusChange={hasRequiredRole() ? handleStatusChange : undefined}
            canEditStatus={hasRequiredRole()}
          />
        </TabsContent>

        <TabsContent value="older-bills" className="space-y-4">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-2">Ältere Rechnungen</h2>
              <p className="text-muted-foreground">
                Alle älteren Abrechnungsperioden
              </p>
            </div>
            {olderPeriods.map((period) => {
              const periodEntries = billPeriodsData.get(period.id) || [];
              const isLoadingPeriod = !billPeriodsData.has(period.id);

              return (
                <TabContent
                  key={period.id}
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
                  onStatusChange={
                    hasRequiredRole() ? handleStatusChange : undefined
                  }
                  canEditStatus={hasRequiredRole()}
                />
              );
            })}
            {olderPeriods.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  Keine älteren Rechnungen vorhanden
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Role-based access notification */}
      {!hasRequiredRole() && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Hinweis:</strong> Sie haben eingeschränkte Berechtigungen.
            Nur der Getränkewart kann Rechnungen erstellen und den Bezahlstatus
            ändern.
          </p>
        </div>
      )}
    </div>
  );
}
