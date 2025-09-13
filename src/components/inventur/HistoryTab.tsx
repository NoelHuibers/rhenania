"use client";

import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  History,
  Package,
  TrendingDown,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import type { InventoryWithItems } from "./utils";

interface HistoryTabProps {
  history: InventoryWithItems[];
}

export default function HistoryTab({ history }: HistoryTabProps) {
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(
    new Set()
  );

  const toggleExpanded = (recordId: string) => {
    setExpandedRecords((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(recordId)) {
        newSet.delete(recordId);
      } else {
        newSet.add(recordId);
      }
      return newSet;
    });
  };

  const getStatusBadge = (difference: number) => {
    if (difference === 0) {
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle className="h-3 w-3 mr-1" />
          <span className="hidden sm:inline">Korrekt</span>
          <span className="sm:hidden">OK</span>
        </Badge>
      );
    } else if (difference > 0) {
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          <TrendingDown className="h-3 w-3 mr-1 rotate-180" />
          <span className="hidden sm:inline">Überschuss: </span>+{difference}
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
          <TrendingDown className="h-3 w-3 mr-1" />
          <span className="hidden sm:inline">Verlust: </span>
          {difference}
        </Badge>
      );
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-primary text-lg sm:text-xl">
          <History className="h-4 w-4 sm:h-5 sm:w-5" />
          Inventur-Historie
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        {history.length === 0 ? (
          <div className="text-center py-8 sm:py-12">
            <Package className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground text-sm sm:text-base">
              Noch keine Inventur-Aufzeichnungen vorhanden.
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-2">
              Speichern Sie Ihre erste Inventur, um die Historie zu sehen.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((record, index) => {
              const isExpanded = expandedRecords.has(record.id);
              const totalItems = record.items.length;
              const itemsWithLoss = record.items.filter(
                (item) => item.difference < 0
              ).length;
              const itemsWithSurplus = record.items.filter(
                (item) => item.difference > 0
              ).length;
              const correctItems = record.items.filter(
                (item) => item.difference === 0
              ).length;
              const totalDifference = record.items.reduce(
                (sum, item) => sum + item.difference,
                0
              );

              return (
                <Card
                  key={record.id}
                  className="border border-border overflow-hidden"
                >
                  <Collapsible
                    open={isExpanded}
                    onOpenChange={() => toggleExpanded(record.id)}
                  >
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors p-4">
                        {/* Mobile Layout */}
                        <div className="flex flex-col gap-3 sm:hidden">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {index === 0 && (
                                <Badge variant="default" className="text-xs">
                                  Letzte
                                </Badge>
                              )}
                              <span className="font-semibold text-base">
                                Inventur #{history.length - index}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>

                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {new Date(
                                record.inventoryDate
                              ).toLocaleDateString("de-DE")}{" "}
                              {new Date(
                                record.inventoryDate
                              ).toLocaleTimeString("de-DE", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>

                            <div className="flex flex-wrap gap-1">
                              <Badge variant="outline" className="text-xs">
                                {totalItems} Artikel
                              </Badge>
                              {correctItems > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-xs text-green-600 border-green-300"
                                >
                                  {correctItems} OK
                                </Badge>
                              )}
                              {itemsWithLoss > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-xs text-red-600 border-red-300"
                                >
                                  {itemsWithLoss} Verlust
                                </Badge>
                              )}
                            </div>

                            <Badge
                              variant="destructive"
                              className="font-semibold self-start"
                            >
                              Verluste: €{record.totalLosses.toFixed(2)}
                            </Badge>
                          </div>
                        </div>

                        {/* Desktop Layout */}
                        <div className="hidden sm:flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <CardTitle className="text-lg">
                              {index === 0 ? (
                                <Badge variant="default" className="mr-2">
                                  Letzte Inventur
                                </Badge>
                              ) : null}
                              Inventur #{history.length - index}
                            </CardTitle>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex gap-2">
                              <Badge variant="outline" className="text-xs">
                                {totalItems} Artikel
                              </Badge>
                              {itemsWithLoss > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-xs text-red-600 border-red-300"
                                >
                                  {itemsWithLoss} Verluste
                                </Badge>
                              )}
                              {itemsWithSurplus > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-xs text-blue-600 border-blue-300"
                                >
                                  {itemsWithSurplus} Überschüsse
                                </Badge>
                              )}
                              {correctItems > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-xs text-green-600 border-green-300"
                                >
                                  {correctItems} Korrekt
                                </Badge>
                              )}
                            </div>
                            <Badge
                              variant="destructive"
                              className="font-semibold"
                            >
                              Verluste: €{record.totalLosses.toFixed(2)}
                            </Badge>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              {new Date(
                                record.inventoryDate
                              ).toLocaleDateString("de-DE")}{" "}
                              {new Date(
                                record.inventoryDate
                              ).toLocaleTimeString("de-DE", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Summary Stats - Responsive Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-4 pt-4 border-t">
                          <div className="text-center">
                            <p className="text-lg sm:text-2xl font-bold text-primary">
                              {totalItems}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Geprüfte Artikel
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg sm:text-2xl font-bold text-green-600">
                              {correctItems}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Korrekte Bestände
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg sm:text-2xl font-bold text-red-600">
                              {itemsWithLoss}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Artikel mit Verlust
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg sm:text-2xl font-bold text-destructive">
                              €{record.totalLosses.toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Gesamtverlust
                            </p>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <CardContent className="pt-0 px-2 sm:px-6">
                        {/* Mobile: Card-based layout */}
                        <div className="sm:hidden space-y-3">
                          {record.items
                            .sort((a, b) => b.lossValue - a.lossValue)
                            .map((item) => (
                              <Card
                                key={`${record.id}-${item.drinkId}`}
                                className="p-3"
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <h4 className="font-medium text-sm">
                                    {item.drinkName}
                                  </h4>
                                  {getStatusBadge(item.difference)}
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-xs">
                                  <div>
                                    <p className="text-muted-foreground">
                                      Gezählt
                                    </p>
                                    <p className="font-semibold">
                                      {item.countedStock}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">
                                      Erwartet
                                    </p>
                                    <p className="font-semibold">
                                      {item.expectedStock}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">
                                      Differenz
                                    </p>
                                    <p
                                      className={`font-semibold ${
                                        item.difference < 0
                                          ? "text-red-600"
                                          : item.difference > 0
                                          ? "text-blue-600"
                                          : "text-green-600"
                                      }`}
                                    >
                                      {item.difference > 0 ? "+" : ""}
                                      {item.difference}
                                    </p>
                                  </div>
                                </div>

                                {item.lossValue > 0 && (
                                  <div className="mt-2 pt-2 border-t">
                                    <p className="text-xs text-muted-foreground">
                                      Verlust
                                    </p>
                                    <p className="text-red-600 font-semibold">
                                      €{item.lossValue.toFixed(2)}
                                    </p>
                                  </div>
                                )}
                              </Card>
                            ))}

                          <div className="mt-3 p-3 bg-muted rounded-lg">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-sm">
                                Gesamtverlust:
                              </span>
                              <span className="font-bold text-destructive">
                                €{record.totalLosses.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Desktop: Table layout */}
                        <div className="hidden sm:block overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left p-3 font-semibold text-sm">
                                  Getränk
                                </th>
                                <th className="text-right p-3 font-semibold text-sm">
                                  Gezählt
                                </th>
                                <th className="text-right p-3 font-semibold text-sm">
                                  Erwartet
                                </th>
                                <th className="text-right p-3 font-semibold text-sm">
                                  Differenz
                                </th>
                                <th className="text-center p-3 font-semibold text-sm">
                                  Status
                                </th>
                                <th className="text-right p-3 font-semibold text-sm">
                                  Verlust (€)
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {record.items
                                .sort((a, b) => b.lossValue - a.lossValue)
                                .map((item, itemIndex) => (
                                  <tr
                                    key={`${record.id}-${item.drinkId}`}
                                    className={`border-b border-border/50 ${
                                      itemIndex % 2 === 0 ? "bg-muted/20" : ""
                                    }`}
                                  >
                                    <td className="p-3 font-medium">
                                      {item.drinkName}
                                    </td>
                                    <td className="p-3 text-right">
                                      {item.countedStock}
                                    </td>
                                    <td className="p-3 text-right">
                                      {item.expectedStock}
                                    </td>
                                    <td className="p-3 text-right">
                                      <span
                                        className={`font-semibold ${
                                          item.difference < 0
                                            ? "text-red-600"
                                            : item.difference > 0
                                            ? "text-blue-600"
                                            : "text-green-600"
                                        }`}
                                      >
                                        {item.difference > 0 ? "+" : ""}
                                        {item.difference}
                                      </span>
                                    </td>
                                    <td className="p-3 text-center">
                                      {getStatusBadge(item.difference)}
                                    </td>
                                    <td className="p-3 text-right">
                                      {item.lossValue > 0 ? (
                                        <span className="text-red-600 font-semibold">
                                          €{item.lossValue.toFixed(2)}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">
                                          -
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-border">
                                <td className="p-3 font-bold" colSpan={2}>
                                  Gesamt
                                </td>
                                <td className="p-3 text-right font-bold">
                                  {record.items.reduce(
                                    (sum, item) => sum + item.countedStock,
                                    0
                                  )}
                                </td>
                                <td className="p-3 text-right font-bold">
                                  <span
                                    className={
                                      totalDifference < 0 ? "text-red-600" : ""
                                    }
                                  >
                                    {totalDifference > 0 ? "+" : ""}
                                    {totalDifference}
                                  </span>
                                </td>
                                <td></td>
                                <td className="p-3 text-right font-bold text-destructive">
                                  €{record.totalLosses.toFixed(2)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        {/* Additional Statistics - Responsive */}
                        {itemsWithLoss > 0 && (
                          <div className="mt-4 p-3 sm:p-4 bg-red-50 dark:bg-red-950/20 rounded-lg">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-600 mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <p className="font-semibold text-red-900 dark:text-red-400 text-sm sm:text-base">
                                  Verlustanalyse
                                </p>
                                <p className="text-xs sm:text-sm text-red-800 dark:text-red-300 mt-1">
                                  {itemsWithLoss} von {totalItems} Artikeln
                                  zeigen Verluste.
                                  <span className="block sm:inline mt-1 sm:mt-0">
                                    Die größten Verluste:{" "}
                                    {record.items
                                      .filter((item) => item.lossValue > 0)
                                      .sort((a, b) => b.lossValue - a.lossValue)
                                      .slice(0, 3)
                                      .map(
                                        (item) =>
                                          `${
                                            item.drinkName
                                          } (€${item.lossValue.toFixed(2)})`
                                      )
                                      .join(", ")}
                                  </span>
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
