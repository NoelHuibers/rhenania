"use server";

import { and, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { drinks, orders } from "~/server/db/schema";

export type ConsumptionLinePoint = {
  monthStart: number; // unix seconds at UTC month start
  label: string; // e.g. "Aug 2025" (rendered in UTC to avoid drift)
  total: number;
};

export type ChartConfigEntry = { label: string; color?: string };
export type ChartConfig = Record<string, ChartConfigEntry>;

// ---- UTC month axis (current month + previous 5), ascending
function monthRangeLast6(): number[] {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const starts: number[] = [];
  for (let i = 5; i >= 0; i--) {
    const ts = Date.UTC(y, m - i, 1, 0, 0, 0);
    starts.push(Math.floor(ts / 1000));
  }
  return starts;
}

export async function getConsumptionLast6MonthsByDrink(): Promise<{
  data: ConsumptionLinePoint[];
  config: ChartConfig;
}> {
  // Bounds: UTC month starts
  const lowerBound = sql<number>`
    CAST(strftime('%s', datetime('now','start of month','-5 months')) AS INTEGER)
  `;
  const upperBound = sql<number>`
    CAST(strftime('%s', datetime('now','start of month','+1 month')) AS INTEGER)
  `;

  // Bucket by UTC month start
  const monthStartExpr = sql<number>`
    CAST(strftime('%s', datetime(${orders.createdAt}, 'unixepoch','start of month')) AS INTEGER)
  `;

  const rows = await db
    .select({
      monthStart: monthStartExpr,
      drinkId: orders.drinkId,
      drinkName: orders.drinkName,
      liters: sql<number>`
      SUM(CASE WHEN ${drinks.volume} IS NOT NULL
               THEN ${orders.amount} * ${drinks.volume}
               ELSE 0 END)
    `.as("liters"),
    })
    .from(orders)
    .leftJoin(drinks, eq(orders.drinkId, drinks.id))
    .where(
      and(
        gte(orders.createdAt, lowerBound),
        lt(orders.createdAt, upperBound),
        isNull(orders.bookingFor)
      )
    )
    .groupBy(monthStartExpr, orders.drinkId, orders.drinkName)
    .having(sql`liters > 0`)
    .orderBy(monthStartExpr);

  // Drinks
  const drinkMap = new Map<string, string>();
  for (const r of rows)
    if (!drinkMap.has(r.drinkId)) drinkMap.set(r.drinkId, r.drinkName);

  // Axis + lookup
  const months = monthRangeLast6();
  const monthIndex = new Map(months.map((t, i) => [t, i]));

  // Label *in UTC* so labels match buckets exactly
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const keyFor = (id: string) => `drink_${id}` as const;

  const data: ConsumptionLinePoint[] = months.map((mStart) => {
    const point: any = {
      monthStart: mStart,
      label: fmt.format(new Date(mStart * 1000)),
      total: 0,
    };
    for (const id of drinkMap.keys()) point[keyFor(id)] = 0;
    return point;
  });

  // Fill
  for (const r of rows) {
    const idx = monthIndex.get(Number(r.monthStart));
    if (idx == null) continue;
    const key = keyFor(r.drinkId);
    (data[idx] as any)[key] = Math.round(Number(r.liters ?? 0) * 100) / 100;
  }

  // Totals
  for (const p of data as any[]) {
    let t = 0;
    for (const id of drinkMap.keys()) t += Number(p[keyFor(id)] ?? 0);
    p.total = Math.round(t * 100) / 100;
  }

  const palette = [
    "#6366F1", // indigo-500
    "#22C55E", // emerald-500
    "#F59E0B", // amber-500
    "#EF4444", // red-500
    "#06B6D4", // cyan-500
    "#A855F7", // violet-500
    "#84CC16", // lime-500
    "#E11D48", // rose-600
    "#3B82F6", // blue-500
  ];

  const config: ChartConfig = {
    // Make the total line a neutral, inky color so it reads over the fills
    total: { label: "Total", color: "#0F172A" }, // slate-900
  };

  let i = 0;
  for (const [id, name] of drinkMap) {
    const colorVar = palette[i % palette.length];
    config[`drink_${id}`] = { label: name, color: colorVar };
    i++;
  }

  return { data, config };
}
