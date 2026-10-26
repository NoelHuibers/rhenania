import { defineConfig, devices } from "@playwright/test";

// E2E runs against a production build (`next build && next start`) backed by
// local libSQL files in `.data/e2e`, freshly seeded on every run. Credentials
// from `.env` are blanked by `scripts/dev/run.ts`, so nothing here can reach
// production. Set E2E_DEV=1 to run against `next dev` while iterating.
//
// Port 3000 is required (seeded tenant domains and Better Auth origins use
// it). `reuseExistingServer: false` makes the run fail instead of silently
// testing a dev server that might be pointed at production.

const PORT = 3000;
const seed = "tsx scripts/dev/setup-local.ts";
const run = "tsx scripts/dev/run.ts";
const command = process.env.E2E_DEV
	? `${seed} && ${run} next dev --turbo`
	: `${seed} && ${run} next build && ${run} next start -p ${PORT}`;

export default defineConfig({
	testDir: "e2e",
	outputDir: "test-results/e2e",
	fullyParallel: false,
	workers: 1,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	timeout: 60_000,
	expect: { timeout: 10_000 },
	reporter: process.env.CI
		? [
				["github"],
				["html", { open: "never", outputFolder: "playwright-report" }],
			]
		: [
				["list"],
				["html", { open: "never", outputFolder: "playwright-report" }],
			],
	snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
	use: {
		baseURL: `http://localhost:${PORT}`,
		locale: "de-DE",
		timezoneId: "Europe/Berlin",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	projects: [
		{ name: "setup", testMatch: /auth\.setup\.ts/ },
		{
			name: "desktop",
			use: { ...devices["Desktop Chrome"] },
			testIgnore: /visual\.spec\.ts/,
			dependencies: ["setup"],
		},
		{
			name: "mobile",
			use: { ...devices["Pixel 7"] },
			grep: /@mobile/,
			testIgnore: /visual\.spec\.ts/,
			dependencies: ["setup"],
		},
		// Screenshot baselines are only valid inside the Playwright Linux
		// image (fonts); run via `pnpm test:visual` / the CI visual job.
		{
			name: "visual",
			use: { ...devices["Desktop Chrome"] },
			testMatch: /visual\.spec\.ts/,
			dependencies: ["setup"],
		},
	],
	webServer: {
		command,
		url: `http://localhost:${PORT}/auth/signin`,
		reuseExistingServer: false,
		timeout: 300_000,
		stdout: "pipe",
		env: { LOCAL_DATA_DIR: ".data/e2e" },
	},
});
