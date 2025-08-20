"use client";

import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { useEffect, useState } from "react";
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
  createdAt: Date;
  drinkName: string;
  amount: number;
  total: number;
  inBill: boolean;
};

export function RecentOrders() {
  const [showOutOfBillOnly, setShowOutOfBillOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemsPerPage = 5;

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

  const filteredOrders = showOutOfBillOnly
    ? orders.filter((order) => !order.inBill)
    : orders;
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
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
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">
              Bestellungen werden geladen...
            </p>
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
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center space-x-2">
            <Switch
              id="out-of-bill-only"
              checked={showOutOfBillOnly}
              onCheckedChange={setShowOutOfBillOnly}
            />
            <Label htmlFor="out-of-bill-only">Nur nicht abgerechnet</Label>
          </div>
          <div className="flex gap-2">
            <Input type="date" className="w-auto" />
            <span className="text-muted-foreground self-center">bis</span>
            <Input type="date" className="w-auto" />
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Orders table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datum</TableHead>
                <TableHead>Getränk</TableHead>
                <TableHead>Anzahl</TableHead>
                <TableHead>Gesamt</TableHead>
                <TableHead>Status</TableHead>
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
                paginatedOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      {new Date(order.createdAt).toLocaleDateString("de-DE")}
                    </TableCell>
                    <TableCell className="font-medium">
                      {order.drinkName}
                    </TableCell>
                    <TableCell>{order.amount}</TableCell>
                    <TableCell>€{order.total.toFixed(2)}</TableCell>
                    <TableCell>
                      {order.inBill && (
                        <Badge variant="secondary">Abgerechnet</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {filteredOrders.length > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Zeige {startIndex + 1} bis{" "}
              {Math.min(startIndex + itemsPerPage, filteredOrders.length)} von{" "}
              {filteredOrders.length} Bestellungen
            </p>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                Seite {currentPage} von {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
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
