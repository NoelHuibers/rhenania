"use client";

import { Download, Eye, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import {
  getUserBillingData,
  type BillData,
  type BillItem,
} from "~/server/actions/profile/getUserBill";

export function BillingOverview() {
  const [billData, setBillData] = useState<BillData | null>(null);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBillingData() {
      try {
        setLoading(true);
        const data = await getUserBillingData();
        setBillData(data.billData);
        setBillItems(data.billItems);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load billing data"
        );
        console.error("Error fetching billing data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchBillingData();
  }, []);

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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Billing Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading billing data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Billing Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <p className="text-destructive mb-2">Error loading billing data</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!billData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Getränkerechnung</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <p className="text-muted-foreground">Keine Rechnung gefunden</p>
            <p className="text-sm text-muted-foreground mt-1">
              Du hast noch keine Getränkerechnung.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Getränkerechnung
          <Badge variant={getStatusVariant(billData.status)}>
            {billData.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Gesamtbetrag</p>
            <p className="text-2xl font-bold">€{billData.total.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Getränke</p>
            <p className="text-lg font-semibold">
              €{billData.drinksTotal.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Mahnung</p>
            <p className="text-lg font-semibold">€{billData.fees.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Altbetrag</p>
            <p className="text-lg font-semibold">
              €{billData.oldBalance.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Rechnung #{billData.billNumber}</span>
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
                Rechnung ansehen
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>
                  Rechnungsdetails #{billData.billNumber}
                </DrawerTitle>
              </DrawerHeader>
              <div className="p-4 space-y-4">
                {billItems.length > 0 ? (
                  <>
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
                  </>
                ) : (
                  <p className="text-muted-foreground text-center py-4">
                    No items found for this bill
                  </p>
                )}
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
