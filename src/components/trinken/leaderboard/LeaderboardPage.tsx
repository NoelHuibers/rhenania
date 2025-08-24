import { ConsumptionLineChart } from "~/components/trinken/leaderboard/ConsumptionChart";
import Leaderboard from "~/components/trinken/leaderboard/Leaderboard";
import MetricsCards from "~/components/trinken/leaderboard/MetricsCards";
import { getConsumptionLast6MonthsByDrink } from "~/server/actions/leaderboard/consumption";
import {
  getLeaderboardLast6Months,
  getMonthlyGrowthRate,
  getTotalConsumption,
} from "~/server/actions/leaderboard/leaderboard";
import { SiteHeader } from "../SiteHeader";

export default async function LeaderboardPage() {
  const rows = await getLeaderboardLast6Months({ limit: 20 });
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

  const total = await getTotalConsumption();
  const growthRate = await getMonthlyGrowthRate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <SiteHeader title="Literboard" />
      <div className="max-w-7xl mx-auto space-y-6 p-4">
        <p className="text-gray-600 text-center">
          Verfolge die steilsten Corpsbrüder
        </p>

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
