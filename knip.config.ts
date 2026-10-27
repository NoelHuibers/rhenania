import type { KnipConfig } from "knip";

// Dead-code check (`pnpm knip`, CI lint job). It runs twice:
//
//   knip               whole repo, tests count as users
//   knip --production  only app code (no tests, no scripts) and only the
//                      `src/server/actions` findings are reported: every
//                      export of a "use server" module is a callable POST
//                      endpoint, so an action that only a test calls is
//                      still dead weight on the attack surface (#57).
//
// Next.js routes, proxy.ts, instrumentation.ts, next.config.js, Vitest,
// Playwright, Drizzle, Stryker, PostCSS and lefthook entry points come from
// knip's built-in plugins; only what they can't see is listed here.
const production = process.argv.includes("--production");

const config: KnipConfig = {
	entry: [
		// CLI scripts run through `tsx` (package.json scripts, CI, docs).
		"scripts/**/*.ts",
		// `pnpm db:seed` (found via package.json, except in production mode).
		...(production ? ["src/server/db/seed.ts!"] : []),
		// Swapped in for `server-only` via the alias in vitest.config.ts.
		"test/stubs/*.ts",
		// Loaded by stryker.config.mjs (`vitest.configFile`).
		"vitest.stryker.config.ts",
	],
	project: [
		"src/**/*.{ts,tsx,js,css}!",
		"scripts/**/*.ts",
		"test/**/*.ts",
		"e2e/**/*.ts",
	],
	drizzle: {
		config: ["drizzle.config.ts", "drizzle.control.config.ts"],
	},
	playwright: {
		// `setup` project in playwright.config.ts (testMatch /auth\.setup\.ts/).
		entry: ["e2e/**/*.spec.ts", "e2e/auth.setup.ts"],
	},
	// Constants and helpers exported next to the code that uses them (so
	// tests can import them) are fine.
	ignoreExportsUsedInFile: true,
	ignoreIssues: {
		// shadcn/ui primitives: kept complete so `shadcn add`/diff stays
		// clean; unused sub-components are expected.
		"src/components/ui/**": ["exports", "types"],
		// Layout constants that document the EtatplanWS workbook; excel.ts
		// still addresses the title row and year cell by number.
		"src/server/actions/cc-kasse/etaplan-excel-map.ts": ["exports"],
		// rotateCalendarToken has no UI yet but is the only way to revoke a
		// leaked calendar feed URL; keep it until the profile page offers it.
		"src/server/actions/events/calendarToken.ts": ["exports"],
		...(production && {
			// Exports only used by tests are expected outside the server
			// actions; the first (non-production) run covers those files.
			"!(src/server/actions/**)": [
				"files",
				"exports",
				"types",
				"duplicates",
				"enumMembers",
				"namespaceMembers",
			],
		}),
	},
	ignoreDependencies: [
		// JSDoc type import in stryker.config.mjs; ships with
		// @stryker-mutator/core.
		"@stryker-mutator/api",
	],
};

export default config;
