"use client";

import { Droplets } from "lucide-react";
import ConsumptionChart from "~/components/trinken/leaderboard/ConsumptionChart";
import {
  allConsumers,
  growthRate,
  monthlyData,
} from "~/components/trinken/leaderboard/data";
import Leaderboard from "~/components/trinken/leaderboard/Leaderboard";
import MetricsCards from "~/components/trinken/leaderboard/MetricsCards";

export default function LiterboardPage() {
  const totalConsumption = allConsumers.reduce((sum, c) => sum + c.amount, 0);
  const activeCount = allConsumers.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Kopfbereich */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900 flex items-center justify-center gap-3">
            <Droplets className="h-10 w-10 text-blue-600" />
            Literboard
          </h1>
          <p className="text-gray-600">Verfolge und feiere Trink‑Champions</p>
        </div>

        {/* Kennzahlen */}
        <MetricsCards
          totalConsumption={totalConsumption}
          growthRate={growthRate}
          activeCount={activeCount}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Rangliste */}
          <Leaderboard consumers={allConsumers} />

          {/* Diagramm */}
          <ConsumptionChart data={monthlyData} growthRate={growthRate} />
        </div>
      </div>
    </div>
  );
}
