"use client";

import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";

export function GamesElo() {
  const gameStats = {
    currentElo: 1847,
    peakElo: 1923,
    totalGames: 156,
    wins: 89,
    losses: 67,
    lastGame: "2024-01-14",
  };

  const eloHistory = [
    { date: "2024-01-01", elo: 1650 },
    { date: "2024-01-03", elo: 1678 },
    { date: "2024-01-05", elo: 1702 },
    { date: "2024-01-07", elo: 1689 },
    { date: "2024-01-09", elo: 1734 },
    { date: "2024-01-11", elo: 1756 },
    { date: "2024-01-13", elo: 1823 },
    { date: "2024-01-15", elo: 1847 },
  ];

  const gameTypes = ["Blitz", "Rapid", "Classical"];
  const winRate = Math.round((gameStats.wins / gameStats.totalGames) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Games & Elo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* KPIs Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Current Elo</p>
            <p className="text-2xl font-bold text-primary">
              {gameStats.currentElo}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Peak Elo</p>
            <p className="text-lg font-semibold">{gameStats.peakElo}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Games</p>
            <p className="text-lg font-semibold">{gameStats.totalGames}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Win Rate</p>
            <p className="text-lg font-semibold text-green-600">{winRate}%</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">W/L</p>
            <p className="text-lg font-semibold">
              {gameStats.wins}/{gameStats.losses}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Last Game</p>
            <p className="text-sm font-medium">
              {new Date(gameStats.lastGame).toLocaleDateString("de-DE")}
            </p>
          </div>
        </div>

        {/* Game type filters */}
        <div className="flex gap-2 justify-center">
          {gameTypes.map((type) => (
            <Badge
              key={type}
              variant="outline"
              className="cursor-pointer hover:bg-accent"
            >
              {type}
            </Badge>
          ))}
        </div>

        {/* Elo Chart */}
        <div className="h-64">
          <ChartContainer
            config={{
              elo: {
                label: "Elo Rating",
                color: "hsl(var(--chart-1))",
              },
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={eloHistory}>
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString("de-DE", {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <YAxis
                  domain={["dataMin - 50", "dataMax + 50"]}
                  tickFormatter={(value) => value.toString()}
                />
                <ChartTooltip
                  content={<ChartTooltipContent />}
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString("de-DE")
                  }
                />
                <Line
                  type="monotone"
                  dataKey="elo"
                  stroke="var(--color-elo)"
                  strokeWidth={2}
                  dot={{ fill: "var(--color-elo)", strokeWidth: 2, r: 4 }}
                  activeDot={{
                    r: 6,
                    stroke: "var(--color-elo)",
                    strokeWidth: 2,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
