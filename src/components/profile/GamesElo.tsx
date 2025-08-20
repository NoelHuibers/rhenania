"use client";

import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";

import type { UserStats } from "./KPIGrid";
import { KPIGrid } from "./KPIGrid";

interface GamesEloProps {
  userStats: UserStats;
  eloHistory?: Array<{ date: string; elo: number }>;
}

export function GamesElo({ userStats, eloHistory = [] }: GamesEloProps) {
  const winRate =
    userStats.totalGames > 0
      ? Math.round((userStats.wins / userStats.totalGames) * 100)
      : 0;

  // ELO trend (absolute + %)
  const eloTrend =
    eloHistory.length > 1
      ? eloHistory[eloHistory.length - 1]!.elo - eloHistory[0]!.elo
      : 0;

  const trendPercentage: number =
    eloHistory.length > 1
      ? Number(
          (
            ((eloHistory[eloHistory.length - 1]!.elo - eloHistory[0]!.elo) /
              eloHistory[0]!.elo) *
            100
          ).toFixed(1)
        )
      : 0;

  // Chart data fallback
  const chartData =
    eloHistory.length > 0
      ? eloHistory
      : [
          {
            date: new Date().toISOString().split("T")[0],
            elo: userStats.currentElo,
          },
        ];

  // Styling
  const lineColor = "#60A5FA"; // Tailwind light-blue-400
  const chartConfig = {
    elo: {
      label: "Elo Rating",
      color: lineColor,
    },
  } as const;

  // Y domain with padding + round to 50 steps
  const minElo = Math.min(...chartData.map((d) => d.elo));
  const maxElo = Math.max(...chartData.map((d) => d.elo));
  const padding = Math.max(50, (maxElo - minElo) * 0.1);
  const domainMin = Math.max(0, Math.floor((minElo - padding) / 50) * 50);
  const domainMax = Math.ceil((maxElo + padding) / 50) * 50;

  // Avoid clutter when many points
  const showValueLabels = chartData.length <= 25;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl font-bold tracking-tight">
          Eloranking
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* KPIs */}
        <KPIGrid
          userStats={userStats}
          eloTrend={eloTrend}
          trendPercentage={trendPercentage}
          winRate={winRate}
        />

        {/* Elo Line Chart */}
        <div className="rounded-lg border bg-card p-4">
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 16, bottom: 12, left: 8 }}
            >
              <CartesianGrid
                vertical={false}
                strokeDasharray="3 3"
                className="stroke-muted/30"
              />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) =>
                  new Date(value).toLocaleDateString("de-DE", {
                    month: "short",
                    day: "numeric",
                  })
                }
                className="text-xs"
              />
              <YAxis
                domain={[domainMin, domainMax]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
              />
              <ChartTooltip
                cursor={{
                  stroke: "hsl(var(--muted-foreground))",
                  strokeWidth: 1,
                }}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    labelFormatter={(value) =>
                      new Date(value as string).toLocaleDateString("de-DE", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    }
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="elo"
                stroke={lineColor}
                strokeWidth={3}
                dot={{ r: 4, stroke: lineColor, strokeWidth: 2, fill: "white" }}
                activeDot={{
                  r: 6,
                  stroke: lineColor,
                  strokeWidth: 2,
                  fill: "white",
                }}
                isAnimationActive
              >
                {showValueLabels && (
                  <LabelList
                    dataKey="elo"
                    position="top"
                    formatter={(value: number) => `${value}`}
                  />
                )}
              </Line>
            </LineChart>
          </ChartContainer>
        </div>
      </CardContent>

      <CardFooter className="flex-col items-start pt-2 gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          {eloTrend > 0 ? (
            <>
              <span className="text-green-600">
                Highperformt um {trendPercentage}%
              </span>
              <svg
                className="h-4 w-4 text-green-600"
                viewBox="0 0 24 24"
                aria-hidden="true"
              />
            </>
          ) : eloTrend < 0 ? (
            <>
              <span className="text-red-600">
                Lowperformt um {Math.abs(trendPercentage)}%
              </span>
              <svg
                className="h-4 w-4 text-red-600"
                viewBox="0 0 24 24"
                aria-hidden="true"
              />
            </>
          ) : (
            <span className="text-muted-foreground">Keine Veränderung</span>
          )}
        </div>
        <div className="text-muted-foreground leading-none">
          Performanzmetriken von {chartData.length} aufgezeichneten Schnellen
        </div>
      </CardFooter>
    </Card>
  );
}
