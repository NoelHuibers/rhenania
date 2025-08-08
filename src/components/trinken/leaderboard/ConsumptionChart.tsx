"use client";

import { TrendingUp } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";

interface ConsumptionChartProps {
  data: { month: string; consumption: number }[];
  growthRate: number;
}

export default function ConsumptionChart({
  data,
  growthRate,
}: ConsumptionChartProps) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle>Verbrauchstrend der letzten 6 Monate</CardTitle>
        <CardDescription>Gesamtverbrauch der letzten 6 Monate</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={{
            consumption: {
              label: "Verbrauch (L)",
              color: "hsl(var(--chart-1))",
            },
          }}
          className="h-[300px]"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                className="text-xs"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                className="text-xs"
                tickFormatter={(value) => `${value / 1000} Tsd`}
              />
              <ChartTooltip
                content={<ChartTooltipContent />}
                formatter={(value) => [`${value}L`, "Verbrauch"]}
              />
              <Line
                type="monotone"
                dataKey="consumption"
                stroke="var(--color-consumption)"
                strokeWidth={3}
                dot={{ fill: "var(--color-consumption)", strokeWidth: 2, r: 4 }}
                activeDot={{
                  r: 6,
                  stroke: "var(--color-consumption)",
                  strokeWidth: 2,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartContainer>
        <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4 text-green-600" />
          <span>Trend steigt diesen Monat um {growthRate}%</span>
        </div>
      </CardContent>
    </Card>
  );
}
