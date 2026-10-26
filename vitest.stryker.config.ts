import { defineConfig } from "vitest/config";

import base from "./vitest.config";

// Mutation testing only needs the tests that exercise the mutated money
// modules (see stryker.config.mjs). Tests that switch process.env.TZ at
// runtime don't work in Stryker's worker threads, and none of them cover
// these modules. (Spread instead of mergeConfig: that would concatenate
// the include lists.)
export default defineConfig({
	...base,
	test: {
		...base.test,
		include: [
			"src/lib/pricing.test.ts",
			"src/lib/decimal.test.ts",
			"src/lib/iban.test.ts",
			"src/server/lib/elo.test.ts",
			"src/server/actions/orders.test.ts",
			"src/server/actions/billings/**/*.test.ts",
			"src/server/actions/inventur/**/*.test.ts",
			"src/server/actions/cc-kasse/kostenerstattungen.test.ts",
		],
	},
});
