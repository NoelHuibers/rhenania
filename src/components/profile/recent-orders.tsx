"use client";

import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { useState } from "react";
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

export function RecentOrders() {
  const [showInBillOnly, setShowInBillOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const orders = [
    {
      id: 1,
      date: "2024-01-15",
      drink: "Espresso",
      amount: 1,
      total: 2.5,
      inBill: true,
    },
    {
      id: 2,
      date: "2024-01-14",
      drink: "Cappuccino",
      amount: 2,
      total: 6.0,
      inBill: true,
    },
    {
      id: 3,
      date: "2024-01-14",
      drink: "Sandwich",
      amount: 1,
      total: 4.8,
      inBill: true,
    },
    {
      id: 4,
      date: "2024-01-13",
      drink: "Latte",
      amount: 1,
      total: 3.2,
      inBill: false,
    },
    {
      id: 5,
      date: "2024-01-12",
      drink: "Water",
      amount: 3,
      total: 3.6,
      inBill: true,
    },
    {
      id: 6,
      date: "2024-01-11",
      drink: "Tea",
      amount: 1,
      total: 2.0,
      inBill: false,
    },
    {
      id: 7,
      date: "2024-01-10",
      drink: "Croissant",
      amount: 2,
      total: 5.6,
      inBill: true,
    },
  ];

  const filteredOrders = showInBillOnly
    ? orders.filter((order) => order.inBill)
    : orders;
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedOrders = filteredOrders.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Orders</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center space-x-2">
            <Switch
              id="in-bill-only"
              checked={showInBillOnly}
              onCheckedChange={setShowInBillOnly}
            />
            <Label htmlFor="in-bill-only">In bill only</Label>
          </div>
          <div className="flex gap-2">
            <Input type="date" className="w-auto" />
            <span className="text-muted-foreground self-center">to</span>
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
                <TableHead>Date</TableHead>
                <TableHead>Drink</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    {new Date(order.date).toLocaleDateString("de-DE")}
                  </TableCell>
                  <TableCell className="font-medium">{order.drink}</TableCell>
                  <TableCell>{order.amount}</TableCell>
                  <TableCell>€{order.total.toFixed(2)}</TableCell>
                  <TableCell>
                    {order.inBill && <Badge variant="secondary">In bill</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to{" "}
            {Math.min(startIndex + itemsPerPage, filteredOrders.length)} of{" "}
            {filteredOrders.length} orders
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
              Page {currentPage} of {totalPages}
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
      </CardContent>
    </Card>
  );
}
