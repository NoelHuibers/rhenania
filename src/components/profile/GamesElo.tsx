"use client";

import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Card, CardContent } from "~/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";

interface UserStats {
  id: string;
  userId: string;
  currentElo: number;
  totalGames: number;
  wins: number;
  losses: number;
  lastGameAt: Date | null;
  peakElo: number;
  createdAt: Date;
  updatedAt: Date;
}

interface GamesEloProps {
  userStats: UserStats;
  eloHistory?: Array<{ date: string; elo: number }>;
}

export function GamesElo({ userStats, eloHistory = [] }: GamesEloProps) {
  const winRate =
    userStats.totalGames > 0
      ? Math.round((userStats.wins / userStats.totalGames) * 100)
      : 0;

  // Default elo history if none provided
  const defaultEloHistory =
    eloHistory.length > 0
      ? eloHistory
      : [
          {
            date: new Date().toISOString().split("T")[0],
            elo: userStats.currentElo,
          },
        ];

  return (
    <Card>
      <CardContent className="space-y-6">
        {/* KPIs Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Derzeitige Elo</p>
            <p className="text-2xl font-bold text-primary">
              {userStats.currentElo}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Peak Elo</p>
            <p className="text-lg font-semibold">{userStats.peakElo}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Anzahl Schnelle</p>
            <p className="text-lg font-semibold">{userStats.totalGames}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Gewinnrate</p>
            <p className="text-lg font-semibold text-green-600">{winRate}%</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">W/L</p>
            <p className="text-lg font-semibold">
              {userStats.wins}/{userStats.losses}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Letztes Schnelles</p>
            <p className="text-sm font-medium">
              {userStats.lastGameAt
                ? userStats.lastGameAt.toLocaleDateString("de-DE")
                : "Never"}
            </p>
          </div>
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
              <LineChart data={defaultEloHistory}>
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
