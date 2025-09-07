// HistoryTab.tsx
"use client";

import { History } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { InventoryWithItems } from "./utils";

interface HistoryTabProps {
  history: InventoryWithItems[];
}

export default function HistoryTab({ history }: HistoryTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary">
          <History className="h-5 w-5" />
          Inventory History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No history records yet. Save your first inventory to see history.
          </p>
        ) : (
          <div className="space-y-4">
            {history.map((record, index) => (
              <Card key={record.id} className="border border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {index === 0
                        ? "Last Inventory"
                        : `Inventory ${history.length - index}`}
                    </CardTitle>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className="text-destructive border-destructive"
                      >
                        Total Losses: €{record.totalLosses.toFixed(2)}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(record.inventoryDate).toLocaleDateString()}{" "}
                        {new Date(record.inventoryDate).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                {record.notes && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {record.notes}
                    </p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
