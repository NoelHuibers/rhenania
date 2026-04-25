import type { Config } from "drizzle-kit";

import { env } from "~/env";

export default {
	schema: "./src/server/db/control-schema.ts",
	out: "./drizzle/control",
	dialect: "turso",
	dbCredentials: {
		url: env.CONTROL_DATABASE_URL,
		authToken: env.CONTROL_DATABASE_AUTH_TOKEN,
	},
	tablesFilter: ["control_*"],
} satisfies Config;
