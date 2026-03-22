/**
 * Diagnostic: show which tables have FK references to rhenania_user_old
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const client = createClient({
	url: process.env.DATABASE_URL ?? "",
	authToken: process.env.DATABASE_AUTH_TOKEN,
});

const result = await client.execute(
	"SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name",
);

for (const row of result.rows) {
	const name = row.name as string;
	const sql = row.sql as string;
	if (sql?.includes("rhenania_user_old")) {
		console.log(`\n⚠️  ${name} references rhenania_user_old:`);
		console.log(sql);
	}
}

console.log("\nDone. Tables listed above need FK fix.");
