// Server-only helpers, deliberately NOT "use server": the functions here
// must not be callable from the browser as server actions.
import "server-only";

import { and, eq, gte, lt, type SQL, sql } from "drizzle-orm";
import { formatDateWith } from "~/lib/format";
import { startOfMonthInTZ } from "~/lib/time";
import { db } from "~/server/db";
import { drinks, orders } from "~/server/db/schema";

export type ConsumptionLinePoint = {
	monthStart: number; // unix seconds at the Berlin month start
	label: string; // e.g. "Aug. 2025", the Berlin month in German
	total: number;
	[key: string]: string | number;
};

export type ChartConfigEntry = { label: string; color?: string };
export type ChartConfig = Record<string, ChartConfigEntry>;

/**
 * Berlin month starts in unix seconds: the previous five months and the
 * current one, ascending, then the start of next month as the exclusive end.
 * Berlin months, not UTC ones, so a beer at 00:30 on the 1st counts in the
 * month it was drunk in.
 */
function monthBoundsLast6(now: Date): number[] {
	const bounds: number[] = [];
	for (let i = -5; i <= 1; i++) {
		bounds.push(Math.floor(startOfMonthInTZ(now, i).getTime() / 1000));
	}
	return bounds;
}

export async function getConsumptionLast6MonthsByDrink(): Promise<{
	data: ConsumptionLinePoint[];
	config: ChartConfig;
}> {
	const bounds = monthBoundsLast6(new Date());
	const months = bounds.slice(0, -1);
	const lowerBound = bounds[0] ?? 0;
	const upperBound = bounds[bounds.length - 1] ?? 0;

	// Bucket each order by its Berlin month. SQLite only knows UTC and the
	// server's own zone, so the month starts come from JS.
	const whens: SQL[] = months
		.slice(1)
		.map((end, i) => sql`WHEN ${orders.createdAt} < ${end} THEN ${months[i]}`);
	const monthStartExpr = sql<number>`CASE ${sql.join(whens, sql` `)} ELSE ${
		months[months.length - 1]
	} END`;

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
				gte(orders.createdAt, new Date(lowerBound * 1000)),
				lt(orders.createdAt, new Date(upperBound * 1000)),
			),
		)
		.groupBy(monthStartExpr, orders.drinkId, orders.drinkName)
		.having(sql`liters > 0`)
		.orderBy(monthStartExpr);

	// Drinks
	const drinkMap = new Map<string, string>();
	for (const r of rows) {
		if (!drinkMap.has(r.drinkId)) {
			drinkMap.set(r.drinkId, r.drinkName);
		}
	}

	// Axis + lookup
	const monthIndex = new Map(months.map((t, i) => [t, i]));
	const keyFor = (id: string) => `drink_${id}` as const;

	const data: ConsumptionLinePoint[] = months.map((mStart) => {
		const point: ConsumptionLinePoint = {
			monthStart: mStart,
			label: formatDateWith(new Date(mStart * 1000), {
				month: "short",
				year: "numeric",
			}),
			total: 0,
		};
		for (const id of drinkMap.keys()) {
			point[keyFor(id)] = 0;
		}
		return point;
	});

	// Fill
	for (const r of rows) {
		const idx = monthIndex.get(Number(r.monthStart));
		if (idx == null) {
			continue;
		}
		const key = keyFor(r.drinkId);
		(data[idx] as ConsumptionLinePoint)[key] =
			Math.round(Number(r.liters ?? 0) * 100) / 100;
	}

	// Totals
	for (const p of data) {
		let t = 0;
		for (const id of drinkMap.keys()) {
			t += Number(p[keyFor(id)] ?? 0);
		}
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
