"use client";

import { ArrowUpDown, Loader2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { BillingEntry } from "~/app/rechnung/page";
import { Button } from "../ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { DefaultDetailsDialog } from "./DefaultsDetailDialog";
import { StatusButton } from "./StatusButton";

interface BillingTableProps {
  entries: BillingEntry[];
  showStatus?: boolean;
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  onStatusChange?: (entryId: string, newStatus: BillingEntry["status"]) => void;
  detailsComponent?: React.ComponentType<{ entry: BillingEntry }>;
  canEditStatus?: boolean;
}

type SortField = "name" | "totalDue";
type SortDirection = "asc" | "desc";

// Utility function
export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
};

export const BillingTable = ({
  entries,
  showStatus = false,
  isLoading = false,
  error = null,
  emptyMessage = "Keine Einträge gefunden",
  onStatusChange,
  detailsComponent: DetailsComponent = DefaultDetailsDialog,
  canEditStatus = false,
}: BillingTableProps) => {
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
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

  // Component for read-only status display
  const StatusDisplay = ({ status }: { status?: BillingEntry["status"] }) => (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${
        status === "Bezahlt"
          ? "bg-green-100 text-green-800"
          : status === "Gestundet"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-red-100 text-red-800"
      }`}
    >
      {status || "Unbezahlt"}
    </span>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Lädt...
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-8 text-red-600">{error}</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <div className="block sm:hidden space-y-3">
        {sortEntries(entries).map((entry) => (
          <div key={entry.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <h3 className="font-medium truncate">{entry.name}</h3>
                <p className="text-lg font-bold text-primary mt-1">
                  {formatCurrency(entry.totalDue)}
                </p>
              </div>
              <DetailsComponent entry={entry} />
            </div>
            {showStatus && (
              <div className="flex items-center justify-between pt-2 border-t">
                <span className="text-sm text-muted-foreground">Status:</span>
                {canEditStatus && onStatusChange ? (
                  <StatusButton
                    status={entry.status}
                    onStatusChange={(newStatus) =>
                      onStatusChange(entry.id, newStatus)
                    }
                  />
                ) : (
                  <StatusDisplay status={entry.status} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[150px]">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("name")}
                  className="h-auto p-0 font-semibold hover:bg-transparent"
                >
                  Name
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="text-right min-w-[120px]">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("totalDue")}
                  className="h-auto p-0 font-semibold hover:bg-transparent"
                >
                  Gesamtbetrag
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              {showStatus && (
                <TableHead className="min-w-[100px]">Status</TableHead>
              )}
              <TableHead className="text-right min-w-[100px]">
                Aktionen
              </TableHead>
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
                    {canEditStatus && onStatusChange ? (
                      <StatusButton
                        status={entry.status}
                        onStatusChange={(newStatus) =>
                          onStatusChange(entry.id, newStatus)
                        }
                      />
                    ) : (
                      <StatusDisplay status={entry.status} />
                    )}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <DetailsComponent entry={entry} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
};
