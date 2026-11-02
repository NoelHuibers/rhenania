// script.ts — the explicit database for CLI scripts.
//
// App code gets its tenant database from a TenantScope
// (`src/server/lib/tenant-scope.ts`). One-shot scripts (`pnpm db:seed`,
// `pnpm db:control:seed`, ...) instead name the database they work on:
// `getScriptDb()` connects to DATABASE_URL from the environment, which in
// `.env` is PRODUCTION; run a script through `scripts/dev/run.ts` to point
// it at the local files. The connection opens on first use, never on import.

import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "~/env";
import { createClient } from "./libsql";
import * as schema from "./schema";
import type { TenantDb } from "./tenants";

type ScriptDb = { client: Client; db: TenantDb };

let scriptDb: ScriptDb | undefined;

/** The env-configured database (DATABASE_URL), for CLI scripts only. */
export function getScriptDb(): ScriptDb {
	if (process.env.NEXT_RUNTIME) {
		throw new Error(
			"getScriptDb() is for CLI scripts; app code gets its tenant DB from the request.",
		);
	}
	if (!scriptDb) {
		const client = createClient({
			url: env.DATABASE_URL,
			authToken: env.DATABASE_AUTH_TOKEN,
		});
		scriptDb = { client, db: drizzle(client, { schema }) };
	}
	return scriptDb;
}
