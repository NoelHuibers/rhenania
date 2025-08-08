"use client";

import { Droplets, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

interface MetricsCardsProps {
  totalConsumption: number;
  growthRate: number | null; // kann null sein, wenn kein Vergleichsmonat vorhanden ist
  activeCount: number;
}

export default function MetricsCards({
  totalConsumption,
  growthRate,
  activeCount,
}: MetricsCardsProps) {
  const growthIsNull =
    growthRate === null || Number.isNaN(growthRate as number);
  const growthText = growthIsNull
    ? "–"
    : `${(growthRate as number) >= 0 ? "+" : ""}${Math.round(
        growthRate as number
      ).toString()}%`;
  const growthColor = growthIsNull
    ? "text-muted-foreground"
    : (growthRate as number) >= 0
    ? "text-green-600"
    : "text-red-600";
  const growthSub = growthIsNull
    ? "Keine Vergleichsdaten"
    : "im Vergleich zum Vormonat";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gesamtverbrauch</CardTitle>
          <Droplets className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {totalConsumption.toLocaleString("de-DE")}L
          </div>
          <p className="text-xs text-muted-foreground">Diesen Monat</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Wachstumsrate</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${growthColor}`}>
            {growthText}
          </div>
          <p className="text-xs text-muted-foreground">{growthSub}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            Aktive Teilnehmende
          </CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{activeCount}</div>
          <p className="text-xs text-muted-foreground">
            Teilnehmende insgesamt
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
