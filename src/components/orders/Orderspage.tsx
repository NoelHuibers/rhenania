"use client";

import { Filter, Pause, Play, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  getTransactionCount,
  getTransactions,
  type TransactionFilters,
} from "~/server/actions/transactions/tracking";

interface Transaction {
  id: string;
  userId: string;
  userName: string;
  drinkId: string;
  drinkName: string;
  amount: number;
  pricePerUnit: number;
  total: number;
  inBill: boolean;
  bookingFor: string | null;
  createdAt: Date;
}

// Utility functions
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
};

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

const formatTime = (date: Date) => {
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
};

// Component: Loading State
const LoadingState = () => (
  <div className="min-h-screen bg-background p-4 sm:p-6">
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading transactions...</p>
        </div>
      </div>
    </div>
  </div>
);

// Component: Empty State
const EmptyState = ({ hasFilters }: { hasFilters: boolean }) => (
  <div className="text-center py-8 text-muted-foreground">
    {hasFilters
      ? "No transactions found matching your filters."
      : "No transactions found."}
  </div>
);

// Component: Header Controls
interface HeaderControlsProps {
  totalCount: number;
  refreshing: boolean;
  isLiveTracking: boolean;
  onRefresh: () => void;
  onToggleLiveTracking: () => void;
  onOpenFilters?: () => void;
}

const HeaderControls = ({
  totalCount,
  refreshing,
  isLiveTracking,
  onRefresh,
  onToggleLiveTracking,
  onOpenFilters,
}: HeaderControlsProps) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 className="text-2xl font-bold sm:hidden">Orders</h1>
      <p className="text-sm sm:text-base text-muted-foreground mt-1">
        Monitor and analyze drink purchase transactions ({totalCount} total)
      </p>
    </div>

    <div className="flex items-center gap-2 sm:gap-4 mt-4 sm:mt-0">
      <Button
        onClick={onRefresh}
        variant="outline"
        size="sm"
        disabled={refreshing}
        className="gap-2"
      >
        <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        <span className="hidden sm:inline">Refresh</span>
      </Button>

      <div className="hidden sm:flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${
            isLiveTracking ? "bg-green-500 animate-pulse" : "bg-muted"
          }`}
        />
        <span className="text-sm text-muted-foreground">
          {isLiveTracking ? "Live Tracking" : "Manual"}
        </span>
      </div>

      <Button
        onClick={onToggleLiveTracking}
        variant={isLiveTracking ? "destructive" : "default"}
        className="gap-2"
      >
        {isLiveTracking ? (
          <Pause className="w-4 h-4" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">
          {isLiveTracking ? "Stop Auto-Refresh" : "Start Auto-Refresh"}
        </span>
      </Button>

      {/* Mobile Filter Button */}
      {onOpenFilters && (
        <Button
          onClick={onOpenFilters}
          variant="outline"
          size="sm"
          className="sm:hidden"
        >
          <Filter className="w-4 h-4" />
        </Button>
      )}
    </div>
  </div>
);

// Component: Search Bar
interface SearchBarProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
}

const SearchBar = ({ searchTerm, onSearchChange }: SearchBarProps) => (
  <div className="relative flex-1 min-w-0">
    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
    <Input
      placeholder="Search by buyer, drink, or purpose..."
      value={searchTerm}
      onChange={(e) => onSearchChange(e.target.value)}
      className="pl-10"
    />
  </div>
);

// Component: Filter Buttons
interface FilterButtonsProps {
  billStatusFilter: string;
  purposeFilter: string;
  onBillStatusChange: (value: string) => void;
  onPurposeChange: (value: string) => void;
  isMobile?: boolean;
}

const FilterButtons = ({
  billStatusFilter,
  purposeFilter,
  onBillStatusChange,
  onPurposeChange,
  isMobile = false,
}: FilterButtonsProps) => (
  <>
    <div className={isMobile ? "space-y-2" : "flex flex-col gap-2"}>
      <label className="text-sm font-medium whitespace-nowrap">
        Bill Status:
      </label>
      <div className="flex gap-2">
        <Button
          variant={billStatusFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => onBillStatusChange("all")}
          className={isMobile ? "flex-1" : ""}
        >
          All
        </Button>
        <Button
          variant={billStatusFilter === "billed" ? "default" : "outline"}
          size="sm"
          onClick={() => onBillStatusChange("billed")}
          className={isMobile ? "flex-1" : ""}
        >
          In Bill
        </Button>
        <Button
          variant={billStatusFilter === "not_billed" ? "default" : "outline"}
          size="sm"
          onClick={() => onBillStatusChange("not_billed")}
          className={isMobile ? "flex-1" : ""}
        >
          Not in Bill
        </Button>
      </div>
    </div>

    <div className={isMobile ? "space-y-2" : "flex flex-col gap-2"}>
      <label className="text-sm font-medium whitespace-nowrap">Purpose:</label>
      <div className="flex gap-2">
        <Button
          variant={purposeFilter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => onPurposeChange("all")}
          className={isMobile ? "flex-1" : ""}
        >
          All
        </Button>
        <Button
          variant={purposeFilter === "personal" ? "default" : "outline"}
          size="sm"
          onClick={() => onPurposeChange("personal")}
          className={isMobile ? "flex-1" : ""}
        >
          Personal
        </Button>
        <Button
          variant={purposeFilter === "events" ? "default" : "outline"}
          size="sm"
          onClick={() => onPurposeChange("events")}
          className={isMobile ? "flex-1" : ""}
        >
          Events
        </Button>
      </div>
    </div>
  </>
);

// Component: Desktop Filters Card
interface DesktopFiltersProps {
  searchTerm: string;
  billStatusFilter: string;
  purposeFilter: string;
  onSearchChange: (value: string) => void;
  onBillStatusChange: (value: string) => void;
  onPurposeChange: (value: string) => void;
}

const DesktopFilters = ({
  searchTerm,
  billStatusFilter,
  purposeFilter,
  onSearchChange,
  onBillStatusChange,
  onPurposeChange,
}: DesktopFiltersProps) => (
  <Card className="hidden sm:block">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Filter className="w-5 h-5" />
        Filters & Search
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-end">
        <SearchBar searchTerm={searchTerm} onSearchChange={onSearchChange} />
        <FilterButtons
          billStatusFilter={billStatusFilter}
          purposeFilter={purposeFilter}
          onBillStatusChange={onBillStatusChange}
          onPurposeChange={onPurposeChange}
        />
      </div>
    </CardContent>
  </Card>
);

// Component: Mobile Filter Sheet
interface MobileFilterSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billStatusFilter: string;
  purposeFilter: string;
  onBillStatusChange: (value: string) => void;
  onPurposeChange: (value: string) => void;
}

const MobileFilterSheet = ({
  open,
  onOpenChange,
  billStatusFilter,
  purposeFilter,
  onBillStatusChange,
  onPurposeChange,
}: MobileFilterSheetProps) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetTrigger asChild>
      <span />
    </SheetTrigger>
    <SheetContent side="bottom" className="h-[400px]">
      <SheetHeader>
        <SheetTitle>Filters</SheetTitle>
        <SheetDescription>Filter transactions</SheetDescription>
      </SheetHeader>
      <div className="space-y-4 mt-4">
        <FilterButtons
          billStatusFilter={billStatusFilter}
          purposeFilter={purposeFilter}
          onBillStatusChange={onBillStatusChange}
          onPurposeChange={onPurposeChange}
          isMobile={true}
        />
        <Button onClick={() => onOpenChange(false)} className="w-full">
          Apply Filters
        </Button>
      </div>
    </SheetContent>
  </Sheet>
);

// Component: Mobile Transaction Card
const MobileTransactionCard = ({
  transaction,
}: {
  transaction: Transaction;
}) => (
  <Card className="mb-3">
    <CardContent className="p-4">
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1">
          <div className="font-semibold text-base">{transaction.userName}</div>
          <div className="text-sm text-muted-foreground">
            {transaction.drinkName}
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-base">
            {formatCurrency(transaction.total)}
          </div>
          <div className="text-xs text-muted-foreground">
            {transaction.amount}x @ {formatCurrency(transaction.pricePerUnit)}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center text-xs">
        <Badge
          variant={transaction.inBill ? "default" : "outline"}
          className="text-xs"
        >
          {transaction.inBill ? "In Bill" : "Not Billed"}
        </Badge>
        {transaction.bookingFor && transaction.bookingFor.trim() !== "" && (
          <Badge variant="secondary" className="text-xs">
            {transaction.bookingFor}
          </Badge>
        )}
        <span className="text-muted-foreground ml-auto">
          {formatDate(transaction.createdAt)} •{" "}
          {formatTime(transaction.createdAt)}
        </span>
      </div>
    </CardContent>
  </Card>
);

// Component: Mobile Transaction List
interface MobileTransactionListProps {
  transactions: Transaction[];
  loading: boolean;
  hasFilters: boolean;
}

const MobileTransactionList = ({
  transactions,
  loading,
  hasFilters,
}: MobileTransactionListProps) => (
  <div className="sm:hidden">
    <h2 className="text-lg font-semibold mb-3">
      Transactions ({transactions.length})
    </h2>
    {transactions.length > 0 ? (
      <div>
        {transactions.map((transaction) => (
          <MobileTransactionCard
            key={transaction.id}
            transaction={transaction}
          />
        ))}
      </div>
    ) : (
      <Card>
        <CardContent className="py-8">
          <EmptyState hasFilters={hasFilters} />
        </CardContent>
      </Card>
    )}
  </div>
);

// Component: Desktop Transaction Table
interface DesktopTransactionTableProps {
  transactions: Transaction[];
  loading: boolean;
  hasFilters: boolean;
}

const DesktopTransactionTable = ({
  transactions,
  loading,
  hasFilters,
}: DesktopTransactionTableProps) => (
  <Card className="hidden sm:block">
    <CardHeader>
      <CardTitle>
        Transaction History ({transactions.length} transactions)
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Buyer</TableHead>
              <TableHead>Drink</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Price/Unit</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Bill Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction) => (
              <TableRow key={transaction.id} className="hover:bg-muted/50">
                <TableCell className="font-medium">
                  {transaction.userName}
                </TableCell>
                <TableCell>{transaction.drinkName}</TableCell>
                <TableCell className="font-mono">
                  {transaction.amount}x
                </TableCell>
                <TableCell className="font-mono">
                  {formatCurrency(transaction.pricePerUnit)}
                </TableCell>
                <TableCell className="font-mono font-semibold">
                  {formatCurrency(transaction.total)}
                </TableCell>
                <TableCell>
                  {transaction.bookingFor &&
                  transaction.bookingFor.trim() !== "" ? (
                    <Badge variant="secondary">{transaction.bookingFor}</Badge>
                  ) : (
                    <span className="text-muted-foreground">Personal</span>
                  )}
                </TableCell>
                <TableCell>{formatDate(transaction.createdAt)}</TableCell>
                <TableCell className="font-mono">
                  {formatTime(transaction.createdAt)}
                </TableCell>
                <TableCell>
                  <Badge variant={transaction.inBill ? "default" : "outline"}>
                    {transaction.inBill ? "In Bill" : "Not Billed"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {transactions.length === 0 && !loading && (
          <EmptyState hasFilters={hasFilters} />
        )}
      </div>
    </CardContent>
  </Card>
);

// Main Component
export default function OrdersTracker() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [billStatusFilter, setBillStatusFilter] = useState<string>("all");
  const [purposeFilter, setPurposeFilter] = useState<string>("all");
  const [totalCount, setTotalCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fetchTransactions = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      setRefreshing(true);

      try {
        const filters: TransactionFilters = {
          search: searchTerm.trim() || undefined,
          billStatus:
            billStatusFilter === "all" ? undefined : (billStatusFilter as any),
          purposeFilter:
            purposeFilter === "all" ? undefined : (purposeFilter as any),
          limit: 100,
        };

        const [transactionResult, countResult] = await Promise.all([
          getTransactions(filters),
          getTransactionCount(filters),
        ]);

        if (transactionResult.success) {
          setTransactions(transactionResult.data);
          setTotalCount(
            countResult.success
              ? countResult.count
              : transactionResult.data.length
          );
        } else {
          toast.error(
            transactionResult.error || "Failed to fetch transactions"
          );
        }
      } catch (error) {
        console.error("Error fetching transactions:", error);
        toast.error("An unexpected error occurred while fetching transactions");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [searchTerm, billStatusFilter, purposeFilter]
  );

  useEffect(() => {
    fetchTransactions(true);
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchTransactions(false);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, billStatusFilter, purposeFilter, fetchTransactions]);

  useEffect(() => {
    if (!isLiveTracking) return;

    const interval = setInterval(() => {
      fetchTransactions(false);
    }, 10000);

    return () => clearInterval(interval);
  }, [isLiveTracking, fetchTransactions]);

  const handleRefresh = () => {
    fetchTransactions(false);
  };

  const hasFilters =
    !!searchTerm || billStatusFilter !== "all" || purposeFilter !== "all";

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        {/* Header */}
        <HeaderControls
          totalCount={totalCount}
          refreshing={refreshing}
          isLiveTracking={isLiveTracking}
          onRefresh={handleRefresh}
          onToggleLiveTracking={() => setIsLiveTracking(!isLiveTracking)}
          onOpenFilters={() => setFiltersOpen(true)}
        />

        {/* Mobile Search Bar */}
        <div className="sm:hidden">
          <SearchBar searchTerm={searchTerm} onSearchChange={setSearchTerm} />
        </div>

        {/* Desktop Filters */}
        <DesktopFilters
          searchTerm={searchTerm}
          billStatusFilter={billStatusFilter}
          purposeFilter={purposeFilter}
          onSearchChange={setSearchTerm}
          onBillStatusChange={setBillStatusFilter}
          onPurposeChange={setPurposeFilter}
        />

        {/* Mobile Filter Sheet */}
        <MobileFilterSheet
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          billStatusFilter={billStatusFilter}
          purposeFilter={purposeFilter}
          onBillStatusChange={setBillStatusFilter}
          onPurposeChange={setPurposeFilter}
        />

        {/* Desktop Transaction Table */}
        <DesktopTransactionTable
          transactions={transactions}
          loading={loading}
          hasFilters={hasFilters}
        />

        {/* Mobile Transaction List */}
        <MobileTransactionList
          transactions={transactions}
          loading={loading}
          hasFilters={hasFilters}
        />
      </div>
    </div>
  );
}
