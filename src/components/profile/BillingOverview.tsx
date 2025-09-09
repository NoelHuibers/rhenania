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
        return "default" as const;
      case "Unbezahlt":
        return "destructive" as const;
      case "Gestundet":
        return "secondary" as const;
      default:
        return "secondary" as const;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">Billing Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin md:h-5 md:w-5" />
            <span className="text-sm md:text-base">
              Loading billing data...
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">Billing Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <p className="text-destructive mb-2 text-sm md:text-base">
              Error loading billing data
            </p>
            <p className="text-xs md:text-sm text-muted-foreground">{error}</p>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="mt-4 h-9 px-3 text-sm md:h-10 md:px-4 md:text-base"
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
          <CardTitle className="text-lg md:text-xl">Getränkerechnung</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <p className="text-sm md:text-base text-muted-foreground">
              Keine Rechnung gefunden
            </p>
            <p className="mt-1 text-xs md:text-sm text-muted-foreground">
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
        <CardTitle className="flex items-center justify-between text-lg md:text-xl">
          Getränkerechnung
          <Badge
            variant={getStatusVariant(billData.status)}
            className="px-2 py-0.5 text-[10px] md:text-xs"
          >
            {billData.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground md:text-sm">
              Gesamtbetrag
            </p>
            <p className="text-xl font-bold md:text-2xl">
              €{billData.total.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground md:text-sm">Getränke</p>
            <p className="text-base font-semibold md:text-lg">
              €{billData.drinksTotal.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground md:text-sm">Mahnung</p>
            <p className="text-base font-semibold md:text-lg">
              €{billData.fees.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground md:text-sm">
              Altbetrag
            </p>
            <p className="text-base font-semibold md:text-lg">
              €{billData.oldBalance.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground md:text-sm">
          <span>Rechnung {billData.billNumber}</span>
          <span>
            Updated:{" "}
            {new Date(billData.lastUpdated).toLocaleDateString("de-DE")}
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Drawer>
            <DrawerTrigger asChild>
              <Button
                aria-label="Rechnung ansehen"
                variant={"outline"}
                className="w-full sm:w-auto sm:self-start h-9 md:h-8 px-3 md:px-3 text-sm md:text-sm bg-transparent"
              >
                <Eye className="mr-2 h-3 w-3 md:h-3 md:w-3" />
                Rechnung ansehen
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle className="text-base md:text-lg">
                  Rechnungsdetails #{billData.billNumber}
                </DrawerTitle>
              </DrawerHeader>
              <div className="space-y-4 p-4">
                {billItems.length > 0 ? (
                  <>
                    {billItems.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between"
                      >
                        <div>
                          <span className="font-medium text-sm md:text-base">
                            {item.item}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground md:text-sm">
                            x{item.quantity}
                          </span>
                        </div>
                        <span className="text-sm md:text-base">
                          €{item.total.toFixed(2)}
                        </span>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between font-bold">
                      <span>Total</span>
                      <span>€{billData.total.toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No items found for this bill
                  </p>
                )}
              </div>
            </DrawerContent>
          </Drawer>

          <Button
            aria-label="Download PDF"
            variant={"outline"}
            className="w-full sm:w-auto sm:self-start h-9 md:h-8 px-3 md:px-3 text-sm md:text-sm bg-transparent"
          >
            <Download className="mr-2 h-3 w-3 md:h-3 md:w-3" />
            Download PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
