"use client";

import { Droplets, TrendingUp, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

interface MetricsCardsProps {
  totalConsumption: number;
  growthRate: number;
  activeCount: number;
}

export default function MetricsCards({
  totalConsumption,
  growthRate,
  activeCount,
}: MetricsCardsProps) {
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
          <CardTitle className="text-sm font-medium">Steilheitsrate</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            +{growthRate}%
          </div>
          <p className="text-xs text-muted-foreground">
            im Vergleich zum Vormonat
          </p>
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
