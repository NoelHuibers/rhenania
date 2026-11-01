// consumption.ts — the Literboard's numbers (#33).
//
// Pure: the Berlin months the consumption chart covers, the chart's points
// and colours from the litres per month and drink, and the change in
// percent between two periods. The orders service reads the litres.

import { formatDateWith } from "~/lib/format";
import { startOfMonthInTZ } from "~/lib/time";

export type ConsumptionLinePoint = {
	monthStart: number; // unix seconds at the Berlin month start
	label: string; // e.g. "Aug. 2025", the Berlin month in German
	total: number;
	[key: string]: string | number;
};

export type ChartConfigEntry = { label: string; color?: string };
export type ChartConfig = Record<string, ChartConfigEntry>;

/** Rounded to two decimals, as every figure on the Literboard. */
export function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

/** The change from `previous` to `current` in percent; null without a base. */
export function changePercent(current: number, previous: number) {
	return previous > 0
		? Math.round(((current - previous) / previous) * 10000) / 100
		: null;
}

/**
 * Berlin month starts in unix seconds: the previous five months and the
 * current one, ascending, then the start of next month as the exclusive end.
 * Berlin months, not UTC ones, so a beer at 00:30 on the 1st counts in the
 * month it was drunk in.
 */
export function monthBoundsLast6(now: Date): number[] {
	const bounds: number[] = [];
	for (let i = -5; i <= 1; i++) {
		bounds.push(Math.floor(startOfMonthInTZ(now, i).getTime() / 1000));
	}
	return bounds;
}

type LitresRow = {
	monthStart: number;
	drinkId: string;
	drinkName: string;
	liters: number | null;
};

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

/** One point per month with the litres per drink and their total. */
export function consumptionChart(
	months: number[],
	rows: LitresRow[],
): { data: ConsumptionLinePoint[]; config: ChartConfig } {
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
		(data[idx] as ConsumptionLinePoint)[key] = round2(Number(r.liters ?? 0));
	}

	// Totals
	for (const p of data) {
		let t = 0;
		for (const id of drinkMap.keys()) {
			t += Number(p[keyFor(id)] ?? 0);
		}
		p.total = round2(t);
	}

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
