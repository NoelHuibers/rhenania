"use client";

import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { getUserOrders } from "~/server/actions/orders";

type Order = {
  id: string;
  createdAt: Date | string;
  drinkName: string;
  amount: number;
  total: number;
  inBill: boolean;
};

export function RecentOrders() {
  const [showOutOfBillOnly, setShowOutOfBillOnly] = useState(false);
  const [fromDate, setFromDate] = useState(""); // YYYY-MM-DD
  const [toDate, setToDate] = useState(""); // YYYY-MM-DD
  const [currentPage, setCurrentPage] = useState(1);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemsPerPage = 5;

  const dateFormatter = useMemo(() => new Intl.DateTimeFormat("de-DE"), []);
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }),
    []
  );

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        setLoading(true);
        const userOrders = await getUserOrders();
        setOrders(userOrders);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Fehler beim Laden der Bestellungen"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  // Reset to first page whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [showOutOfBillOnly, fromDate, toDate]);

  const filteredOrders = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00.000`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`) : null;

    return orders
      .filter((o) => (showOutOfBillOnly ? !o.inBill : true))
      .filter((o) => {
        const d = new Date(o.createdAt);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
  }, [orders, showOutOfBillOnly, fromDate, toDate]);

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedOrders = filteredOrders.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Letzte Bestellungen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-8">
            <div className="animate-pulse space-y-4">
              <div className="h-4 w-1/3 bg-muted rounded" />
              <div className="h-24 w-full bg-muted rounded" />
              <div className="h-4 w-2/3 bg-muted rounded" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Letzte Bestellungen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <p className="text-red-500">Fehler: {error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Letzte Bestellungen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center justify-between">
          <div className="flex items-center space-x-2">
            <Switch
              id="out-of-bill-only"
              checked={showOutOfBillOnly}
              onCheckedChange={setShowOutOfBillOnly}
            />
            <Label
              htmlFor="out-of-bill-only"
              className="cursor-pointer select-none"
            >
              Nur nicht abgerechnet
            </Label>
          </div>

          <div className="flex w-full sm:w-auto gap-2">
            <div className="flex-1">
              <Label htmlFor="fromDate" className="sr-only">
                Von
              </Label>
              <Input
                id="fromDate"
                type="date"
                className="w-full"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <span className="text-muted-foreground self-center">bis</span>
            <div className="flex-1">
              <Label htmlFor="toDate" className="sr-only">
                Bis
              </Label>
              <Input
                id="toDate"
                type="date"
                className="w-full"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" aria-label="Filter anwenden">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Mobile list (cards) */}
        <div className="space-y-2 sm:hidden">
          {paginatedOrders.length === 0 ? (
            <div className="rounded-lg border p-6 text-center">
              <p className="text-muted-foreground">
                Keine Bestellungen gefunden
              </p>
            </div>
          ) : (
            paginatedOrders.map((order) => {
              const d = new Date(order.createdAt);
              return (
                <div key={order.id} className="rounded-lg border p-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">
                        {dateFormatter.format(d)}
                      </p>
                      <p className="font-medium truncate">{order.drinkName}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {currencyFormatter.format(order.total)}
                      </p>
                      {order.inBill && (
                        <Badge variant="secondary" className="mt-1">
                          Abgerechnet
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Anzahl</div>
                    <div className="text-right">{order.amount}</div>
                    <div className="text-muted-foreground">Status</div>
                    <div className="text-right">
                      {order.inBill ? "Abgerechnet" : "Nicht abgerechnet"}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block rounded-md border overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="whitespace-nowrap">Datum</TableHead>
                <TableHead className="whitespace-nowrap">Getränk</TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  Anzahl
                </TableHead>
                <TableHead className="whitespace-nowrap text-right">
                  Gesamt
                </TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <p className="text-muted-foreground">
                      Keine Bestellungen gefunden
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedOrders.map((order) => {
                  const d = new Date(order.createdAt);
                  return (
                    <TableRow key={order.id}>
                      <TableCell className="align-top">
                        {dateFormatter.format(d)}
                      </TableCell>
                      <TableCell className="font-medium align-top">
                        {order.drinkName}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {order.amount}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        {currencyFormatter.format(order.total)}
                      </TableCell>
                      <TableCell className="align-top">
                        {order.inBill && (
                          <Badge variant="secondary">Abgerechnet</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {filteredOrders.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-2 sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Zeige {filteredOrders.length === 0 ? 0 : startIndex + 1} bis{" "}
              {Math.min(startIndex + itemsPerPage, filteredOrders.length)} von{" "}
              {filteredOrders.length} Bestellungen
            </p>
            <div className="flex items-center justify-between sm:justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                aria-label="Vorherige Seite"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Seite {currentPage} von {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                aria-label="Nächste Seite"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
