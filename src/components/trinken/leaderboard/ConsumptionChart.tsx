"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
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
  type ChartConfig,
} from "~/components/ui/chart";

export type ConsumptionLinePoint = {
  monthStart: number;
  label: string;
  total: number;
  [key: string]: string | number;
};

export function ConsumptionLineChart({
  title = "Consumption (last 6 months)",
  data,
  config,
}: {
  title?: string;
  data: ConsumptionLinePoint[];
  config: ChartConfig;
}) {
  const seriesKeys = React.useMemo(
    () => Object.keys(config).filter((k) => k !== "total"),
    [config]
  );

  const lastTotal = Number(data?.[data.length - 1]?.total ?? 0);
  const prevTotal = Number(data?.[data.length - 2]?.total ?? 0);
  const changePct =
    prevTotal > 0 ? ((lastTotal - prevTotal) / prevTotal) * 100 : 0;
  const trendingUp = changePct >= 0;
  const changePctText = `${Math.abs(changePct).toFixed(1)}%`;
  const firstLabel = data?.[0]?.label ?? "";
  const lastLabel = data?.[data.length - 1]?.label ?? "";

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
      </CardHeader>

      <CardContent>
        <ChartContainer config={config} className="h-[320px] w-full">
          <ResponsiveContainer>
            <AreaChart
              data={data}
              margin={{ left: 0, right: 8, top: 8, bottom: 8 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickMargin={8} />
              <YAxis tickMargin={8} axisLine={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />

              <defs>
                {seriesKeys.map((k) => (
                  <linearGradient
                    key={k}
                    id={`fill-${k}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={`var(--color-${k})`}
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={`var(--color-${k})`}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                ))}
              </defs>

              {seriesKeys.map((k) => (
                <Area
                  key={k}
                  type="natural"
                  dataKey={k}
                  stackId="a"
                  stroke={`var(--color-${k})`}
                  strokeWidth={2}
                  fill={`url(#fill-${k})`}
                  fillOpacity={0.4}
                />
              ))}

              <Line
                type="monotone"
                dataKey="total"
                stroke="var(--color-total)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        <div className="py-4 flex flex-wrap items-center gap-4 text-xs">
          <LegendItem
            name={(config as any).total?.label ?? "Total"}
            color={(config as any).total?.color ?? "var(--foreground)"}
          />
          {seriesKeys.map((k) => (
            <LegendItem
              key={k}
              name={(config as any)[k]?.label ?? k}
              color={(config as any)[k]?.color ?? undefined}
            />
          ))}
        </div>
      </CardContent>

      {/* Footer with trend + timeline, matching your example */}
      <CardFooter>
        <div className="flex w-full items-start gap-2 text-sm">
          <div className="grid gap-2">
            <div className="text-muted-foreground flex items-center gap-2 leading-none">
              {firstLabel} – {lastLabel}
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

function LegendItem({ name, color }: { name: string; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{name}</span>
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color }}
      />
    </div>
  );
}
