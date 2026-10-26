import type { Config } from "drizzle-kit";

import { env } from "~/env";
import { assertWriteAllowed } from "./scripts/lib/guard";

// `drizzle-kit migrate`/`push` write to whatever DB the env points at, which
// is production when `.env` is loaded. Require CONFIRM_PROD for remote DBs.
if (process.argv.some((arg) => arg === "migrate" || arg === "push")) {
	assertWriteAllowed(
		env.CONTROL_DATABASE_URL,
		`drizzle-kit ${process.argv.includes("push") ? "push" : "migrate"}`,
	);
}

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
