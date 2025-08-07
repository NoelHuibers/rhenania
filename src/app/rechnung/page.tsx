"use client";

import { ArrowUpDown, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
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

// Mock data types
interface DrinkItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface BillingEntry {
  id: string;
  name: string;
  totalDue: number;
  status?: "Paid" | "Unpaid";
  items: DrinkItem[];
}

interface BillingPeriod {
  id: string;
  name: string;
  entries: BillingEntry[];
}

// Mock data
const mockCurrentOrders: BillingEntry[] = [
  {
    id: "1",
    name: "John Smith",
    totalDue: 45.5,
    items: [
      { id: "1", name: "Beer", quantity: 3, unitPrice: 8.0, subtotal: 24.0 },
      { id: "2", name: "Wine", quantity: 2, unitPrice: 12.0, subtotal: 24.0 },
      { id: "3", name: "Soda", quantity: 1, unitPrice: 3.5, subtotal: 3.5 },
    ],
  },
  {
    id: "2",
    name: "Sarah Johnson",
    totalDue: 32.0,
    items: [
      {
        id: "4",
        name: "Cocktail",
        quantity: 2,
        unitPrice: 15.0,
        subtotal: 30.0,
      },
      { id: "5", name: "Water", quantity: 1, unitPrice: 2.0, subtotal: 2.0 },
    ],
  },
  {
    id: "3",
    name: "Mike Davis",
    totalDue: 18.5,
    items: [
      { id: "6", name: "Beer", quantity: 2, unitPrice: 8.0, subtotal: 16.0 },
      { id: "7", name: "Chips", quantity: 1, unitPrice: 2.5, subtotal: 2.5 },
    ],
  },
];

const mockCurrentBilling: BillingEntry[] = [
  {
    id: "4",
    name: "Corporate Account A",
    totalDue: 1250.0,
    status: "Unpaid",
    items: [
      { id: "8", name: "Beer", quantity: 50, unitPrice: 8.0, subtotal: 400.0 },
      { id: "9", name: "Wine", quantity: 30, unitPrice: 12.0, subtotal: 360.0 },
      {
        id: "10",
        name: "Cocktail",
        quantity: 25,
        unitPrice: 15.0,
        subtotal: 375.0,
      },
      {
        id: "11",
        name: "Appetizers",
        quantity: 23,
        unitPrice: 5.0,
        subtotal: 115.0,
      },
    ],
  },
  {
    id: "5",
    name: "Event Catering B",
    totalDue: 890.75,
    status: "Paid",
    items: [
      {
        id: "12",
        name: "Wine",
        quantity: 45,
        unitPrice: 12.0,
        subtotal: 540.0,
      },
      {
        id: "13",
        name: "Champagne",
        quantity: 15,
        unitPrice: 20.0,
        subtotal: 300.0,
      },
      {
        id: "14",
        name: "Hors d'oeuvres",
        quantity: 10,
        unitPrice: 5.075,
        subtotal: 50.75,
      },
    ],
  },
];

const mockPastPeriods: BillingPeriod[] = [
  {
    id: "period-2024-01",
    name: "January 2024",
    entries: [
      {
        id: "6",
        name: "Restaurant Chain C",
        totalDue: 2100.0,
        status: "Paid",
        items: [
          {
            id: "15",
            name: "Beer",
            quantity: 100,
            unitPrice: 8.0,
            subtotal: 800.0,
          },
          {
            id: "16",
            name: "Wine",
            quantity: 80,
            unitPrice: 12.0,
            subtotal: 960.0,
          },
          {
            id: "17",
            name: "Spirits",
            quantity: 20,
            unitPrice: 17.0,
            subtotal: 340.0,
          },
        ],
      },
      {
        id: "7",
        name: "Hotel Group D",
        totalDue: 1575.25,
        status: "Paid",
        items: [
          {
            id: "18",
            name: "Cocktail",
            quantity: 75,
            unitPrice: 15.0,
            subtotal: 1125.0,
          },
          {
            id: "19",
            name: "Premium Wine",
            quantity: 25,
            unitPrice: 18.01,
            subtotal: 450.25,
          },
        ],
      },
    ],
  },
  {
    id: "period-2023-12",
    name: "December 2023",
    entries: [
      {
        id: "8",
        name: "Holiday Events Inc",
        totalDue: 3200.0,
        status: "Paid",
        items: [
          {
            id: "20",
            name: "Champagne",
            quantity: 80,
            unitPrice: 25.0,
            subtotal: 2000.0,
          },
          {
            id: "21",
            name: "Premium Cocktails",
            quantity: 60,
            unitPrice: 20.0,
            subtotal: 1200.0,
          },
        ],
      },
    ],
  },
];

type SortField = "name" | "totalDue";
type SortDirection = "asc" | "desc";

export default function BillingDashboard() {
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [activeTab, setActiveTab] = useState("current-orders");

  const handleCreateReport = async () => {
    setIsCreatingReport(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsCreatingReport(false);
    // In a real app, you'd refresh the data here
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const DetailsDialog = ({ entry }: { entry: BillingEntry }) => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Order Details - {entry.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
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
            <span className="text-lg font-semibold">Total:</span>
            <span className="text-lg font-bold">
              {formatCurrency(entry.totalDue)}
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const BillingTable = ({
    entries,
    showStatus = false,
  }: {
    entries: BillingEntry[];
    showStatus?: boolean;
  }) => (
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
              Total Due
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          </TableHead>
          {showStatus && <TableHead>Status</TableHead>}
          <TableHead className="text-right">Actions</TableHead>
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
                <Badge
                  variant={entry.status === "Paid" ? "default" : "destructive"}
                >
                  {entry.status}
                </Badge>
              </TableCell>
            )}
            <TableCell className="text-right">
              <DetailsDialog entry={entry} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing Reports</h1>
          <p className="text-muted-foreground">
            Manage and track billing reports for your drink orders
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
              Creating Report...
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Create New Billing Report
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
            Current Orders
          </TabsTrigger>
          <TabsTrigger value="current-billing" className="text-sm">
            Current Billing
          </TabsTrigger>
          {mockPastPeriods.map((period) => (
            <TabsTrigger key={period.id} value={period.id} className="text-sm">
              {period.name}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="current-orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Orders</CardTitle>
              <p className="text-sm text-muted-foreground">
                Live orders that haven't been billed yet
              </p>
            </CardHeader>
            <CardContent>
              <BillingTable entries={mockCurrentOrders} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="current-billing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Billing Period</CardTitle>
              <p className="text-sm text-muted-foreground">
                Summary of unpaid amounts for the current period
              </p>
            </CardHeader>
            <CardContent>
              <BillingTable entries={mockCurrentBilling} showStatus />
            </CardContent>
          </Card>
        </TabsContent>

        {mockPastPeriods.map((period) => (
          <TabsContent key={period.id} value={period.id} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{period.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Billing report for {period.name}
                </p>
              </CardHeader>
              <CardContent>
                <BillingTable entries={period.entries} showStatus />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
