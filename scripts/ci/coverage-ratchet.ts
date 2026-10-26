// scripts/ci/coverage-ratchet.ts — coverage may only go up.
//
//   pnpm test:coverage && pnpm coverage:check     # CI
//   pnpm test:coverage && pnpm coverage:baseline  # after raising coverage
//
// Compares coverage/coverage-summary.json with test/coverage-baseline.json
// per area. Fails if any area's lines or branches drop by more than the
// tolerance; prints the areas that improved so the baseline can be bumped.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { aggregate, compare, type Totals } from "./coverage";

const SUMMARY = path.resolve("coverage/coverage-summary.json");
const BASELINE = path.resolve("test/coverage-baseline.json");

if (!existsSync(SUMMARY)) {
	console.error(
		"No coverage/coverage-summary.json. Run pnpm test:coverage first.",
	);
	process.exit(1);
}
const current = aggregate(JSON.parse(readFileSync(SUMMARY, "utf8")));

if (process.argv.includes("--update")) {
	writeFileSync(BASELINE, `${JSON.stringify(current, null, "\t")}\n`);
	console.log("Baseline updated:");
	for (const [area, t] of Object.entries(current)) {
		console.log(
			`  ${area.padEnd(10)} lines ${t.lines}%  branches ${t.branches}%`,
		);
	}
	process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as Record<
	string,
	Totals
>;
const { regressions, improvements } = compare(baseline, current);
for (const line of improvements) {
	console.log(`↑ ${line}`);
}
if (regressions.length > 0) {
	for (const line of regressions) {
		console.error(`✗ ${line}`);
	}
	console.error(
		"\nCoverage dropped. Add tests, or justify and run pnpm coverage:baseline.",
	);
	process.exit(1);
}
console.log("Coverage OK (no area below the baseline).");
