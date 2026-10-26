import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

// Tests never see the real `.env` (it points at the production databases).
// Every DB URL below is a throwaway local file; `test/setup.ts` refuses to run
// if anything else leaks in.
const unusedDb = `file:${path.join(os.tmpdir(), "rhenania-test-unused.db")}`;

export default defineConfig({
	resolve: { tsconfigPaths: true },
	envDir: false,
	test: {
		environment: "node",
		include: ["src/**/*.test.ts", "test/**/*.test.ts", "scripts/**/*.test.ts"],
		globalSetup: ["test/global-setup.ts"],
		setupFiles: ["test/setup.ts"],
		clearMocks: true,
		env: {
			NODE_ENV: "test",
			TZ: process.env.TZ ?? "Europe/Berlin",
			SKIP_ENV_VALIDATION: "",
			AUTH_SECRET: "test-secret-not-used-anywhere",
			BETTER_AUTH_URL: "http://localhost:3000",
			DATABASE_URL: unusedDb,
			DATABASE_AUTH_TOKEN: "",
			CONTROL_DATABASE_URL: unusedDb,
			CONTROL_DATABASE_AUTH_TOKEN: "",
			TURSO_PLATFORM_TOKEN: "",
			TURSO_ORG_SLUG: "",
			GMAIL: "",
			GMAIL_PASSWORD: "",
			TOMAIL: "",
			BLOB_READ_WRITE_TOKEN: "",
		},
		coverage: {
			provider: "v8",
			include: ["src/**/*.{ts,tsx}"],
			exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
			reporter: ["text-summary", "html", "lcov", "json-summary"],
		},
	},
});
