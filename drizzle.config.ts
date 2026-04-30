import type { Config } from "drizzle-kit";

import { env } from "~/env";

// Tenant DBs hold only this schema (no co-tenant tables). No tablesFilter
// needed — the previous `rhenania_*` filter was a co-existence relic.
export default {
	schema: "./src/server/db/schema.ts",
	dialect: "turso",
	dbCredentials: {
		url: env.DATABASE_URL,
		authToken: env.DATABASE_AUTH_TOKEN,
	},
} satisfies Config;
