// Mutation testing for the money code: Stryker changes the source (flips
// operators, removes conditions, …) and checks that some test fails. A
// surviving mutant means the tests would not notice that bug.
//
//   pnpm test:mutation      # nightly in CI; ~minutes, not for every PR

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
	testRunner: "vitest",
	plugins: ["@stryker-mutator/vitest-runner"],
	vitest: { configFile: "vitest.stryker.config.ts" },
	mutate: [
		"src/lib/pricing.ts",
		"src/lib/decimal.ts",
		"src/lib/iban.ts",
		"src/server/actions/billings/billings.ts",
		"src/server/actions/inventur/inventur.ts",
		"src/server/actions/cc-kasse/kostenerstattungen.ts",
		"src/server/lib/elo.ts",
	],
	coverageAnalysis: "perTest",
	reporters: ["clear-text", "progress", "html", "json"],
	htmlReporter: { fileName: "reports/mutation/index.html" },
	jsonReporter: { fileName: "reports/mutation/mutation.json" },
	thresholds: { high: 80, low: 60, break: 50 },
	timeoutMS: 30_000,
	concurrency: 4,
	tempDirName: ".stryker-tmp",
};
