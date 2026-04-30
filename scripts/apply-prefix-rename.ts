// scripts/apply-prefix-rename.ts
//
// One-shot: drops the legacy `rhenania_` prefix from every table and every
// auto-named unique index in the existing tenant DB. Patches the drizzle
// migrations journal so the freshly regenerated baseline (0000_mighty_karma)
// is recorded as already-applied.
//
// Run AFTER:
//   1. schema.ts has been updated to the no-prefix `sqliteTableCreator`.
//   2. The old migrations have been deleted and `pnpm db:generate` has
//      produced a fresh baseline `drizzle/0000_<...>.sql`.
//
//   pnpm tsx scripts/apply-prefix-rename.ts          # dry-run
//   pnpm tsx scripts/apply-prefix-rename.ts --apply  # actually rename
//
// Re-running with --apply on an already-renamed DB is a no-op (no rows match
// the rhenania_* filter).

import "dotenv/config";

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";

import { env } from "~/env";

const PREFIX = "rhenania_";
const MIGRATIONS_DIR = join(process.cwd(), "drizzle");
const apply = process.argv.includes("--apply");

const client = createClient({
	url: env.DATABASE_URL,
	authToken: env.DATABASE_AUTH_TOKEN,
});

type IndexRow = {
	name: string;
	tbl_name: string;
	sql: string | null;
};

async function listPrefixedTables(): Promise<string[]> {
	const rs = await client.execute({
		sql: `SELECT name FROM sqlite_master
		      WHERE type = 'table' AND name LIKE ?
		        AND name NOT LIKE 'sqlite_%'`,
		args: [`${PREFIX}%`],
	});
	return rs.rows.map((r) => String(r.name));
}

async function listPrefixedIndexes(): Promise<IndexRow[]> {
	const rs = await client.execute({
		sql: `SELECT name, tbl_name, sql FROM sqlite_master
		      WHERE type = 'index' AND name LIKE ?`,
		args: [`${PREFIX}%`],
	});
	return rs.rows.map((r) => ({
		name: String(r.name),
		tbl_name: String(r.tbl_name),
		sql: r.sql == null ? null : String(r.sql),
	}));
}

function stripPrefix(s: string): string {
	return s.startsWith(PREFIX) ? s.slice(PREFIX.length) : s;
}

// Rebuild a CREATE INDEX statement against the renamed table + new index name.
// Replaces both the index name and any references to the old table name in
// the SQL captured from sqlite_master.
function rewriteIndexSql(
	originalSql: string,
	oldTable: string,
	newTable: string,
	oldName: string,
	newName: string,
): string {
	let sql = originalSql;
	// Replace the index name (it may appear quoted with backticks/quotes).
	sql = sql.replace(
		new RegExp(
			`(CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:[\`"\\[])?)${escapeRegex(oldName)}((?:[\`"\\]])?)`,
			"i",
		),
		(_match, p1, p2) => `${p1}${newName}${p2}`,
	);
	// Replace ON `oldTable` / "oldTable" / [oldTable] / oldTable
	sql = sql.replace(
		new RegExp(
			`(ON\\s+(?:[\`"\\[])?)${escapeRegex(oldTable)}((?:[\`"\\]])?)`,
			"i",
		),
		(_match, p1, p2) => `${p1}${newTable}${p2}`,
	);
	return sql;
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function findFreshBaseline(): { name: string; hash: string } {
	const files = readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.sort();
	const baseline = files[0];
	if (!baseline) {
		throw new Error(
			"No migrations found in drizzle/ — run `pnpm db:generate` first.",
		);
	}
	const sql = readFileSync(join(MIGRATIONS_DIR, baseline), "utf8");
	const hash = createHash("sha256").update(sql).digest("hex");
	return { name: baseline, hash };
}

async function main() {
	const tables = await listPrefixedTables();
	const indexes = await listPrefixedIndexes();
	const baseline = findFreshBaseline();

	console.log("Plan:");
	console.log(`  - rename ${tables.length} table(s):`);
	for (const t of tables) console.log(`      ${t} → ${stripPrefix(t)}`);
	console.log(`  - rename ${indexes.length} index(es):`);
	for (const i of indexes)
		console.log(
			`      ${i.name} → ${stripPrefix(i.name)} (on ${stripPrefix(i.tbl_name)})`,
		);
	console.log(
		`  - reset __drizzle_migrations and mark baseline ${baseline.name} applied`,
	);

	if (tables.length === 0 && indexes.length === 0) {
		console.log(
			"\nNothing to rename — database already free of the rhenania_ prefix.",
		);
	}

	if (!apply) {
		console.log("\nDry-run only. Re-run with --apply to commit.");
		process.exit(0);
	}

	// 1) Drop indexes first (we'll recreate them after the table rename so
	//    their SQL references the new table name).
	for (const idx of indexes) {
		console.log(`  drop index ${idx.name}`);
		await client.execute(`DROP INDEX IF EXISTS \`${idx.name}\``);
	}

	// 2) Rename tables.
	for (const t of tables) {
		const newName = stripPrefix(t);
		console.log(`  rename table ${t} → ${newName}`);
		await client.execute(`ALTER TABLE \`${t}\` RENAME TO \`${newName}\``);
	}

	// 3) Recreate indexes against the new table names + new index names.
	for (const idx of indexes) {
		if (!idx.sql) {
			console.warn(
				`    ⚠ index ${idx.name} had no SQL in sqlite_master (auto-PK?), skipping recreate`,
			);
			continue;
		}
		const newName = stripPrefix(idx.name);
		const newTable = stripPrefix(idx.tbl_name);
		const newSql = rewriteIndexSql(
			idx.sql,
			idx.tbl_name,
			newTable,
			idx.name,
			newName,
		);
		console.log(`  create index ${newName}`);
		await client.execute(newSql);
	}

	// 4) Reset migration journal: clear, then mark fresh baseline applied.
	await ensureMigrationsTable();
	await client.execute("DELETE FROM __drizzle_migrations");
	await client.execute({
		sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
		args: [baseline.hash, Date.now()],
	});

	console.log(`\n✅ Done. Baseline ${baseline.name} marked applied.`);
	process.exit(0);
}

main().catch((e) => {
	console.error("\nFAILED:", e);
	process.exit(1);
});
