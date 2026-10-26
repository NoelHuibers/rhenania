import { describe, expect, test } from "vitest";

import { aggregate, compare } from "./coverage";

const m = (covered: number, total: number) => ({ covered, total });

describe("coverage ratchet", () => {
	const summary = {
		total: { lines: m(50, 100), branches: m(10, 40) },
		"/r/src/server/a.ts": { lines: m(9, 10), branches: m(3, 4) },
		"/r/src/server/b.ts": { lines: m(8, 10), branches: m(1, 4) },
		"/r/src/app/api/x/route.ts": { lines: m(5, 5), branches: m(0, 0) },
		"/r/src/components/c.tsx": { lines: m(0, 75), branches: m(0, 32) },
	};

	test("aggregates per area", () => {
		expect(aggregate(summary)).toEqual({
			total: { lines: 50, branches: 25 },
			api: { lines: 100, branches: 100 },
			server: { lines: 85, branches: 50 },
		});
	});

	test("flags drops beyond the tolerance, not jitter", () => {
		const base = { server: { lines: 85, branches: 50 } };
		expect(
			compare(base, { server: { lines: 84.8, branches: 50 } }).regressions,
		).toEqual([]);
		expect(
			compare(base, { server: { lines: 84, branches: 50 } }).regressions,
		).toEqual(["server lines: 85% → 84%"]);
		expect(compare(base, {}).regressions[0]).toMatch(/missing/);
	});

	test("reports clear improvements", () => {
		const { improvements } = compare(
			{ lib: { lines: 60, branches: 50 } },
			{ lib: { lines: 70, branches: 50 } },
		);
		expect(improvements[0]).toMatch(/lib lines: 60% → 70%/);
	});
});
