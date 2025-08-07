"use client";

import { ArrowUpDown, Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  createNewBilling,
  getAllBillPeriods,
  getBillsForPeriod,
  getLatestBillPeriod,
} from "~/server/actions/billings";
import { getCurrentOrders } from "~/server/actions/currentOrders";

// Types
interface DrinkItem {
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

interface BillingPeriod {
  id: string;
  name: string;
  entries: BillingEntry[];
}

type SortField = "name" | "totalDue";
type SortDirection = "asc" | "desc";

interface BillingTableProps {
  entries: BillingEntry[];
  showStatus?: boolean;
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  onStatusChange?: (entryId: string, newStatus: BillingEntry["status"]) => void;
  detailsComponent?: React.ComponentType<{ entry: BillingEntry }>;
}

interface BillingCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
  headerDate?: string;
}

interface TabContentProps {
  entries: BillingEntry[];
  isLoading: boolean;
  error: string | null;
  cardTitle: string;
  cardDescription: string;
  headerDate?: string;
  showStatus?: boolean;
  emptyMessage?: string;
  onStatusChange?: (entryId: string, newStatus: BillingEntry["status"]) => void;
  detailsComponent?: React.ComponentType<{ entry: BillingEntry }>;
}

// Utility function
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
};

// Generic Status Cycle Component
const StatusButton = ({
  status,
  onStatusChange,
}: {
  status: BillingEntry["status"];
  onStatusChange: (newStatus: BillingEntry["status"]) => void;
}) => {
  const cycleStatus = () => {
    const statusOrder: BillingEntry["status"][] = [
      "Unbezahlt",
      "Bezahlt",
      "Gestundet",
    ];
    const currentIndex = statusOrder.indexOf(status || "Unbezahlt");
    const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];
    onStatusChange(nextStatus);
  };

  const getStatusColor = (status: BillingEntry["status"]) => {
    switch (status) {
      case "Bezahlt":
        return "bg-green-100 text-green-800 hover:bg-green-200";
      case "Gestundet":
        return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200";
      default:
        return "bg-red-100 text-red-800 hover:bg-red-200";
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycleStatus}
      className={`${getStatusColor(status)} border-0`}
    >
      {status || "Unbezahlt"}
    </Button>
  );
};

// Default Details Dialog Component
const DefaultDetailsDialog = ({ entry }: { entry: BillingEntry }) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm">
        Details
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Bestelldetails - {entry.name}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Artikel</TableHead>
              <TableHead className="text-right">Anzahl</TableHead>
              <TableHead className="text-right">Einzelpreis</TableHead>
              <TableHead className="text-right">Zwischensumme</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entry.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(item.unitPrice)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(item.subtotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-between items-center pt-4 border-t">
          <span className="text-lg font-semibold">Gesamt:</span>
          <span className="text-lg font-bold">
            {formatCurrency(entry.totalDue)}
          </span>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);

// Generic Billing Card Component
const BillingCard = ({
  title,
  description,
  children,
  headerDate,
}: BillingCardProps) => (
  <Card>
    <CardHeader>
      <div className="flex justify-between items-start">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {headerDate && (
          <div className="text-sm text-muted-foreground">{headerDate}</div>
        )}
      </div>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

// Generic Billing Table Component
const BillingTable = ({
  entries,
  showStatus = false,
  isLoading = false,
  error = null,
  emptyMessage = "Keine Einträge gefunden",
  onStatusChange,
  detailsComponent: DetailsComponent = DefaultDetailsDialog,
}: BillingTableProps) => {
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortEntries = (entries: BillingEntry[]) => {
    return [...entries].sort((a, b) => {
      let aValue = sortField === "name" ? a.name : a.totalDue;
      let bValue = sortField === "name" ? b.name : b.totalDue;

      if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = (bValue as string).toLowerCase();
      }

      if (sortDirection === "asc") {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Lädt...
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-8 text-red-600">{error}</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <Button
              variant="ghost"
              onClick={() => handleSort("name")}
              className="h-auto p-0 font-semibold hover:bg-transparent"
            >
              Name
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          </TableHead>
          <TableHead className="text-right">
            <Button
              variant="ghost"
              onClick={() => handleSort("totalDue")}
              className="h-auto p-0 font-semibold hover:bg-transparent"
            >
              Gesamtbetrag
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          </TableHead>
          {showStatus && <TableHead>Status</TableHead>}
          <TableHead className="text-right">Aktionen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortEntries(entries).map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="font-medium">{entry.name}</TableCell>
            <TableCell className="text-right font-mono">
              {formatCurrency(entry.totalDue)}
            </TableCell>
            {showStatus && (
              <TableCell>
                {onStatusChange ? (
                  <StatusButton
                    status={entry.status}
                    onStatusChange={(newStatus) =>
                      onStatusChange(entry.id, newStatus)
                    }
                  />
                ) : (
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      entry.status === "Bezahlt"
                        ? "bg-green-100 text-green-800"
                        : entry.status === "Gestundet"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {entry.status || "Unbezahlt"}
                  </span>
                )}
              </TableCell>
            )}
            <TableCell className="text-right">
              <DetailsComponent entry={entry} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

// Generic Tab Content Component
const TabContent = ({
  entries,
  isLoading,
  error,
  cardTitle,
  cardDescription,
  headerDate,
  showStatus = false,
  emptyMessage,
  onStatusChange,
  detailsComponent,
}: TabContentProps) => (
  <BillingCard
    title={cardTitle}
    description={cardDescription}
    headerDate={headerDate}
  >
    <BillingTable
      entries={entries}
      showStatus={showStatus}
      isLoading={isLoading}
      error={error}
      emptyMessage={emptyMessage}
      onStatusChange={onStatusChange}
      detailsComponent={detailsComponent}
    />
  </BillingCard>
);

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

  const handleStatusChange = (
    entryId: string,
    newStatus: BillingEntry["status"]
  ) => {
    // Update the status in current billing
    setCurrentBilling((prev) =>
      prev.map((entry) =>
        entry.id === entryId ? { ...entry, status: newStatus } : entry
      )
    );

    // TODO: Send update to backend
    console.log(`Status changed for ${entryId} to ${newStatus}`);
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
