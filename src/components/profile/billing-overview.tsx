"use client";

import { Download, Eye } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "~/components/ui/drawer";
import { Separator } from "~/components/ui/separator";

export function BillingOverview() {
  const billData = {
    status: "Unbezahlt", // Unbezahlt, Bezahlt, Gestundet
    total: 45.8,
    drinksTotal: 38.5,
    fees: 2.3,
    oldBalance: 5.0,
    billNumber: "2024-001",
    lastUpdated: "2024-01-15",
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "Bezahlt":
        return "default";
      case "Unbezahlt":
        return "destructive";
      case "Gestundet":
        return "secondary";
      default:
        return "secondary";
    }
  };

  const billItems = [
    { item: "Kaffee", quantity: 3, price: 2.5, total: 7.5 },
    { item: "Sandwich", quantity: 2, price: 4.8, total: 9.6 },
    { item: "Wasser", quantity: 5, price: 1.2, total: 6.0 },
    { item: "Service Fee", quantity: 1, price: 2.3, total: 2.3 },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Billing Overview
          <Badge variant={getStatusVariant(billData.status)}>
            {billData.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">€{billData.total.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Drinks</p>
            <p className="text-lg font-semibold">
              €{billData.drinksTotal.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Fees</p>
            <p className="text-lg font-semibold">€{billData.fees.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Old Balance</p>
            <p className="text-lg font-semibold">
              €{billData.oldBalance.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Bill #{billData.billNumber}</span>
          <span>
            Updated:{" "}
            {new Date(billData.lastUpdated).toLocaleDateString("de-DE")}
          </span>
        </div>

        <div className="flex gap-2">
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline" className="flex-1 bg-transparent">
                <Eye className="mr-2 h-4 w-4" />
                View Bill
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Bill Details #{billData.billNumber}</DrawerTitle>
              </DrawerHeader>
              <div className="p-4 space-y-4">
                {billItems.map((item, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center"
                  >
                    <div>
                      <span className="font-medium">{item.item}</span>
                      <span className="text-muted-foreground ml-2">
                        x{item.quantity}
                      </span>
                    </div>
                    <span>€{item.total.toFixed(2)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>€{billData.total.toFixed(2)}</span>
                </div>
              </div>
            </DrawerContent>
          </Drawer>

          <Button variant="outline" className="flex-1 bg-transparent">
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
