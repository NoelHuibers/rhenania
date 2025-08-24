"use client";

import { Filter, Pause, Play, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
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

export default function OrdersTracker() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLiveTracking, setIsLiveTracking] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [billStatusFilter, setBillStatusFilter] = useState<string>("all");
  const [purposeFilter, setPurposeFilter] = useState<string>("all");
  const [totalCount, setTotalCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

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
          limit: 100, // Fetch more records
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
    [searchTerm, billStatusFilter, purposeFilter, toast]
  );

  // Initial load
  useEffect(() => {
    fetchTransactions(true);
  }, []);

  // Debounced search and filter updates
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchTransactions(false);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, billStatusFilter, purposeFilter, fetchTransactions]);

  // Live tracking simulation (optional - you can remove this if not needed)
  useEffect(() => {
    if (!isLiveTracking) return;

    const interval = setInterval(() => {
      fetchTransactions(false);
    }, 10000); // Refresh every 10 seconds when live tracking is on

    return () => clearInterval(interval);
  }, [isLiveTracking, fetchTransactions]);

  const handleRefresh = () => {
    fetchTransactions(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
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
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground mt-1">
            Monitor and analyze drink purchase transactions ({totalCount} total)
          </p>

          <div className="flex items-center gap-4">
            <Button
              onClick={handleRefresh}
              variant="outline"
              size="sm"
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>

            <div className="flex items-center gap-2">
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
              onClick={() => setIsLiveTracking(!isLiveTracking)}
              variant={isLiveTracking ? "destructive" : "default"}
              className="gap-2"
            >
              {isLiveTracking ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isLiveTracking ? "Stop Auto-Refresh" : "Start Auto-Refresh"}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-end">
              {/* Search */}
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search by buyer, drink, or purpose..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Bill Status Filter */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium whitespace-nowrap">
                  Bill Status:
                </label>
                <div className="flex gap-2">
                  <Button
                    variant={billStatusFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setBillStatusFilter("all")}
                  >
                    All
                  </Button>
                  <Button
                    variant={
                      billStatusFilter === "billed" ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setBillStatusFilter("billed")}
                  >
                    In Bill
                  </Button>
                  <Button
                    variant={
                      billStatusFilter === "not_billed" ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setBillStatusFilter("not_billed")}
                  >
                    Not in Bill
                  </Button>
                </div>
              </div>

              {/* Purpose Filter */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium whitespace-nowrap">
                  Purpose:
                </label>
                <div className="flex gap-2">
                  <Button
                    variant={purposeFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPurposeFilter("all")}
                  >
                    All
                  </Button>
                  <Button
                    variant={
                      purposeFilter === "personal" ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setPurposeFilter("personal")}
                  >
                    Personal
                  </Button>
                  <Button
                    variant={purposeFilter === "events" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPurposeFilter("events")}
                  >
                    Events
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card>
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
                    <TableRow
                      key={transaction.id}
                      className="hover:bg-muted/50"
                    >
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
                          <Badge variant="secondary">
                            {transaction.bookingFor}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            Personal
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Intl.DateTimeFormat("de-DE", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        }).format(transaction.createdAt)}
                      </TableCell>
                      <TableCell className="font-mono">
                        {new Intl.DateTimeFormat("de-DE", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        }).format(transaction.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={transaction.inBill ? "default" : "outline"}
                        >
                          {transaction.inBill ? "In Bill" : "Not Billed"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {transactions.length === 0 && !loading && (
                <div className="text-center py-8 text-muted-foreground">
                  {searchTerm ||
                  billStatusFilter !== "all" ||
                  purposeFilter !== "all"
                    ? "No transactions found matching your filters."
                    : "No transactions found."}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
