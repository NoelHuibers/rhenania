import type { Config } from "drizzle-kit";

import { env } from "~/env";
import { assertWriteAllowed } from "./scripts/lib/guard";

// `drizzle-kit migrate`/`push` write to whatever DB the env points at, which
// is production when `.env` is loaded. Require CONFIRM_PROD for remote DBs.
if (process.argv.some((arg) => arg === "migrate" || arg === "push")) {
	assertWriteAllowed(
		env.DATABASE_URL,
		`drizzle-kit ${process.argv.includes("push") ? "push" : "migrate"}`,
	);
}

// Tenant DBs hold only this schema (no co-tenant tables). No tablesFilter
// needed — the previous `rhenania_*` filter was a co-existence relic.
export default {
	schema: "./src/server/db/schema.ts",
	out: "./drizzle",
	dialect: "turso",
	dbCredentials: {
		url: env.DATABASE_URL,
		authToken: env.DATABASE_AUTH_TOKEN,
	},
} satisfies Config;
