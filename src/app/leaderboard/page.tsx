import { Droplets } from "lucide-react";
import { ConsumptionLineChart } from "~/components/trinken/leaderboard/ConsumptionChart";
import Leaderboard from "~/components/trinken/leaderboard/Leaderboard";
import MetricsCards from "~/components/trinken/leaderboard/MetricsCards";
import { getConsumptionLast6MonthsByDrink } from "~/server/actions/consumption";
import {
  getLeaderboardLast6Months,
  getMonthlyGrowthRate,
} from "~/server/actions/leaderboard";

export default async function Page() {
  const rows = await getLeaderboardLast6Months({ limit: 10 });
  const { data, config } = await getConsumptionLast6MonthsByDrink();

  const consumers = rows.map((r, i) => ({
    id: i + 1,
    name: r.userName,
    avatar: r.avatar ?? "/placeholder.svg?height=40&width=40",
    amount: r.liters,
    change:
      r.changePct === null
        ? "neu"
        : `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(0)}%`,
  }));

  const total = consumers.reduce((s, c) => s + c.amount, 0);
  const growthRate = await getMonthlyGrowthRate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Kopfbereich */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-gray-900 flex items-center justify-center gap-3">
            <Droplets className="h-10 w-10 text-blue-600" />
            Literboard
          </h1>
          <p className="text-gray-600">Verfolge die steilsten Corpsbrüder</p>
        </div>

        {/* Kennzahlen */}
        <MetricsCards
          totalConsumption={total}
          growthRate={growthRate}
          activeCount={consumers.length}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Rangliste */}
          <Leaderboard consumers={consumers} />

          {/* Diagramm */}
          <ConsumptionLineChart data={data} config={config} />
        </div>
      </div>
    </div>
  );
}
