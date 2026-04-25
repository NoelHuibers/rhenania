// scripts/apply-tenant-drop.ts
//
// Applies the step-2 tenant DROP migration directly via libSQL, bypassing
// drizzle-kit (which was swallowing the error message). Also reconciles the
// `__drizzle_migrations` journal so future `pnpm db:migrate` runs work.
//
// Run AFTER `pnpm db:migrate-identity`:
//   pnpm tsx scripts/apply-tenant-drop.ts

import "dotenv/config";

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";

import { env } from "~/env";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle");

const client = createClient({
	url: env.DATABASE_URL,
	authToken: env.DATABASE_AUTH_TOKEN,
});

async function tableExists(name: string): Promise<boolean> {
	const rs = await client.execute({
		sql: "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
		args: [name],
	});
	return rs.rows.length > 0;
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
	const rs = await client.execute("SELECT hash FROM __drizzle_migrations");
	return new Set(rs.rows.map((r) => String(r.hash)));
}

function hashSql(sql: string): string {
	return createHash("sha256").update(sql).digest("hex");
}

function listMigrationFiles(): string[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort();
}

async function backfillJournalForExisting() {
	// If `rhenania_user` exists but the journal is empty, the original schema
	// was applied via push/manual SQL. Mark migration 0000 as already-applied
	// so drizzle-kit won't try to re-create those tables next run.
	const userExists = await tableExists("rhenania_user");
	if (!userExists) return;

	await ensureMigrationsTable();
	const applied = await appliedHashes();

	const files = listMigrationFiles();
	const baseline = files[0];
	if (!baseline) return;

	const baselinePath = join(MIGRATIONS_DIR, baseline);
	const baselineSql = readFileSync(baselinePath, "utf8");
	const baselineHash = hashSql(baselineSql);

	if (!applied.has(baselineHash)) {
		await client.execute({
			sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
			args: [baselineHash, Date.now()],
		});
		console.log(`✓ marked ${baseline} as already-applied (backfill)`);
	}
}

async function applyDropMigration() {
	const files = listMigrationFiles();
	const dropMigration = files.find((f) => f.includes("clean_kabuki"));
	if (!dropMigration) {
		console.log("Drop migration not found in drizzle/, nothing to do");
		return;
	}

	const sql = readFileSync(join(MIGRATIONS_DIR, dropMigration), "utf8");
	const hash = hashSql(sql);
	const applied = await appliedHashes();

	if (applied.has(hash)) {
		console.log(`✓ ${dropMigration} already applied`);
		return;
	}

	const statements = sql
		.split(/-->\s*statement-breakpoint/)
		.map((s) => s.trim())
		.filter(Boolean);

	console.log(`Applying ${dropMigration} (${statements.length} statements)…`);
	for (const stmt of statements) {
		try {
			await client.execute(stmt);
			console.log(`  ✓ ${stmt.split("\n")[0]}`);
		} catch (err) {
			console.error(`  ✗ ${stmt}`);
			throw err;
		}
	}

	await client.execute({
		sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
		args: [hash, Date.now()],
	});
	console.log(`✓ ${dropMigration} recorded as applied`);
}

async function main() {
	console.log("Reconciling tenant DB migration journal…");
	await backfillJournalForExisting();
	await applyDropMigration();
	console.log("✅ Done");
	process.exit(0);
}

main().catch((e) => {
	console.error("\nFAILED:", e);
	process.exit(1);
});
