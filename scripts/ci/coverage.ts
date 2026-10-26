// scripts/ci/coverage.ts — pure helpers for the coverage ratchet.

export type Totals = { lines: number; branches: number };
type Metric = { total: number; covered: number };
type Summary = Record<string, { lines: Metric; branches: Metric }>;

/** Areas the ratchet tracks; first match wins. */
export const AREAS: Array<[string, RegExp]> = [
	["api", /\/src\/app\/api\//],
	["server", /\/src\/server\//],
	["lib", /\/src\/lib\//],
	["proxy", /\/src\/proxy\.ts$/],
];

const pct = (m: Metric) =>
	m.total === 0 ? 100 : Math.round((m.covered / m.total) * 1000) / 10;

export function aggregate(summary: Summary): Record<string, Totals> {
	const sums: Record<string, { lines: Metric; branches: Metric }> = {};
	const add = (key: string, entry: Summary[string]) => {
		if (!sums[key]) {
			sums[key] = {
				lines: { total: 0, covered: 0 },
				branches: { total: 0, covered: 0 },
			};
		}
		const s = sums[key];
		s.lines.total += entry.lines.total;
		s.lines.covered += entry.lines.covered;
		s.branches.total += entry.branches.total;
		s.branches.covered += entry.branches.covered;
	};
	for (const [file, entry] of Object.entries(summary)) {
		if (file === "total") {
			continue;
		}
		const area = AREAS.find(([, re]) => re.test(file))?.[0];
		if (area) {
			add(area, entry);
		}
	}
	const result: Record<string, Totals> = {};
	const total = summary.total;
	if (total) {
		result.total = { lines: pct(total.lines), branches: pct(total.branches) };
	}
	for (const [area] of AREAS) {
		const s = sums[area];
		if (s) {
			result[area] = { lines: pct(s.lines), branches: pct(s.branches) };
		}
	}
	return result;
}

/** Allowed drop in percentage points (tiny jitter from timezone-dependent branches). */
export const TOLERANCE = 0.3;

export function compare(
	baseline: Record<string, Totals>,
	current: Record<string, Totals>,
) {
	const regressions: string[] = [];
	const improvements: string[] = [];
	for (const [area, base] of Object.entries(baseline)) {
		const now = current[area];
		if (!now) {
			regressions.push(`${area}: missing from the current report`);
			continue;
		}
		for (const metric of ["lines", "branches"] as const) {
			const diff = Math.round((now[metric] - base[metric]) * 10) / 10;
			if (diff < -TOLERANCE) {
				regressions.push(
					`${area} ${metric}: ${base[metric]}% → ${now[metric]}%`,
				);
			} else if (diff >= 1) {
				improvements.push(
					`${area} ${metric}: ${base[metric]}% → ${now[metric]}% (consider pnpm coverage:baseline)`,
				);
			}
		}
	}
	return { regressions, improvements };
}
