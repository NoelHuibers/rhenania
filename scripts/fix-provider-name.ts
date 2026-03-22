import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const client = createClient({
	url: process.env.DATABASE_URL ?? "",
	authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function main() {
	const result = await client.execute(
		"UPDATE rhenania_account SET providerId = 'microsoft' WHERE providerId = 'microsoft-entra-id'",
	);
	console.log(`Updated ${result.rowsAffected} account(s).`);
}

main().catch((err) => {
	console.error("Failed:", err);
	process.exit(1);
});
