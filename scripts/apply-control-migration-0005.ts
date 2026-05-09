// scripts/apply-control-migration-0005.ts
//
// Applies drizzle/control/0005_cold_matthew_murdock.sql directly via libSQL
// so we get a real error message (drizzle-kit's spinner eats them). Also
// reconciles `__drizzle_migrations` so future `pnpm db:control:migrate` works.
//
//   pnpm tsx scripts/apply-control-migration-0005.ts          # diagnose
//   pnpm tsx scripts/apply-control-migration-0005.ts --apply  # commit

import "dotenv/config";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";

import { env } from "~/env";

const apply = process.argv.includes("--apply");
const MIGRATIONS_DIR = join(process.cwd(), "drizzle", "control");
const TARGET = "0005_cold_matthew_murdock.sql";

const client = createClient({
	url: env.CONTROL_DATABASE_URL,
	authToken: env.CONTROL_DATABASE_AUTH_TOKEN,
});

async function listTables(): Promise<string[]> {
	const rs = await client.execute({
		sql: `SELECT name FROM sqlite_master
		      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
		args: [],
	});
	return rs.rows.map((r) => String(r.name));
}

async function ensureMigrationsTable() {
	await client.execute(`
		CREATE TABLE IF NOT EXISTS __drizzle_migrations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			hash TEXT NOT NULL,
			created_at NUMERIC
		)
	`);
}

async function appliedHashes(): Promise<Set<string>> {
	await ensureMigrationsTable();
	const rs = await client.execute("SELECT hash FROM __drizzle_migrations");
	return new Set(rs.rows.map((r) => String(r.hash)));
}

function hashSql(sql: string): string {
	return createHash("sha256").update(sql).digest("hex");
}

async function main() {
	const tables = await listTables();
	console.log(`Control DB has ${tables.length} tables:`);
	for (const t of tables) console.log(`  - ${t}`);

	const journal = await appliedHashes();
	console.log(`\n__drizzle_migrations has ${journal.size} entries.`);

	const sql = readFileSync(join(MIGRATIONS_DIR, TARGET), "utf8");
	const hash = hashSql(sql);
	if (journal.has(hash)) {
		console.log(`\n${TARGET} already recorded as applied. Nothing to do.`);
		process.exit(0);
	}

	const expectedNewTables = [
		"control_cross_tenant_challenge",
		"control_cross_tenant_game",
		"control_user_stat",
	];
	const missing = expectedNewTables.filter((t) => !tables.includes(t));
	const orphan = ["control_global_user_stat"].filter((t) => tables.includes(t));

	console.log(`\nDiagnosis:`);
	console.log(`  Missing tables to create: ${missing.join(", ") || "(none)"}`);
	console.log(
		`  Orphan tables from reverted draft: ${orphan.join(", ") || "(none)"}`,
	);

	const statements = sql
		.split(/-->\s*statement-breakpoint/)
		.map((s) => s.trim())
		.filter(Boolean);

	if (!apply) {
		console.log(`\nWould execute ${statements.length} statements.`);
		console.log("Re-run with --apply to commit.");
		process.exit(0);
	}

	// Drop the orphan from the reverted globalUserStats draft (if it exists),
	// otherwise the column-rename-style refactor leaves it behind.
	for (const t of orphan) {
		console.log(`Dropping orphan table ${t}…`);
		await client.execute(`DROP TABLE IF EXISTS \`${t}\``);
	}

	for (const stmt of statements) {
		try {
			await client.execute(stmt);
			console.log(`  ✓ ${stmt.split("\n")[0]}`);
		} catch (err) {
			console.error(`\nFAILED on statement:\n${stmt}\n`);
			throw err;
		}
	}

	await client.execute({
		sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
		args: [hash, Date.now()],
	});
	console.log(`\n✅ ${TARGET} applied and recorded.`);
	process.exit(0);
}

main().catch((e) => {
	console.error("\n", e);
	process.exit(1);
});
