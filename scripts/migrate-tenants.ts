// scripts/migrate-tenants.ts
//
// Brings every tenant DB up to date with the migrations in ./drizzle — the
// same folder `pnpm db:migrate` applies to the Rhenania DB and that
// `provisionTenant` runs against brand-new tenants. Idempotent: drizzle's
// migrator only applies journal entries newer than the last row in each
// tenant's __drizzle_migrations table.
//
// Suspended tenants are skipped. A failure on one tenant doesn't stop the
// others; the script exits 1 if any tenant failed.
//
// `--repair` handles tenant DBs whose schema ran ahead of their journal
// (e.g. via `drizzle-kit push`): it applies each pending migration statement
// by statement, skips statements whose object already exists, and records
// the journal row so future plain runs work again.
//
//   pnpm db:migrate-tenants --dry-run          # show pending migrations per tenant
//   pnpm db:migrate-tenants                    # apply to all tenants
//   pnpm db:migrate-tenants --tenant=hassia    # apply to a single tenant
//   pnpm db:migrate-tenants --repair           # tolerate already-applied statements

import "dotenv/config";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { controlDb } from "~/server/db/control";
import { tenants } from "~/server/db/control-schema";
import { createClient } from "~/server/db/libsql";
import * as tenantSchema from "~/server/db/schema";

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

type JournalEntry = { idx: number; when: number; tag: string };

function readJournal(): JournalEntry[] {
	const raw = readFileSync(
		path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"),
		"utf8",
	);
	return (JSON.parse(raw) as { entries: JournalEntry[] }).entries;
}

function parseArgs() {
	const args = process.argv.slice(2);
	return {
		dryRun: args.includes("--dry-run"),
		repair: args.includes("--repair"),
		slug: args.find((a) => a.startsWith("--tenant="))?.split("=")[1],
	};
}

// Mirrors the drizzle migrator's pending check: an entry is pending when its
// journal `when` is newer than the newest `created_at` in the tenant's
// __drizzle_migrations table.
async function pendingFor(
	client: Client,
	entries: JournalEntry[],
): Promise<JournalEntry[]> {
	const table = await client.execute(
		"SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
	);
	if (table.rows.length === 0) return entries;

	const rs = await client.execute(
		"SELECT max(created_at) AS last FROM __drizzle_migrations",
	);
	const lastApplied = Number(rs.rows[0]?.last ?? 0);
	return entries.filter((e) => e.when > lastApplied);
}

// Applies one pending migration statement-by-statement, tolerating objects
// that already exist, then records the journal row exactly as drizzle's
// migrator would (hash = sha256 of the file, created_at = journal `when`).
async function repairMigration(client: Client, entry: JournalEntry) {
	const sqlContent = readFileSync(
		path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
		"utf8",
	);
	const statements = sqlContent
		.split(/-->\s*statement-breakpoint/)
		.map((s) => s.trim())
		.filter(Boolean);

	let applied = 0;
	let skipped = 0;
	for (const stmt of statements) {
		try {
			await client.execute(stmt);
			applied++;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			if (/already exists|duplicate column name/i.test(msg)) {
				skipped++;
				continue;
			}
			throw err;
		}
	}

	await client.execute(`
		CREATE TABLE IF NOT EXISTS __drizzle_migrations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			hash TEXT NOT NULL,
			created_at NUMERIC
		)
	`);
	await client.execute({
		sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
		args: [createHash("sha256").update(sqlContent).digest("hex"), entry.when],
	});
	console.log(
		`  ✓ ${entry.tag}: ${applied} applied, ${skipped} skipped (already present)`,
	);
}

async function main() {
	const { dryRun, repair, slug } = parseArgs();
	const entries = readJournal();

	const rows = await controlDb
		.select({
			slug: tenants.slug,
			status: tenants.status,
			dbUrl: tenants.dbUrl,
			dbAuthToken: tenants.dbAuthToken,
		})
		.from(tenants);

	const targets = slug ? rows.filter((t) => t.slug === slug) : rows;
	if (targets.length === 0) {
		console.error(
			slug ? `No tenant with slug '${slug}'.` : "No tenants found.",
		);
		process.exit(1);
	}

	console.log(
		`${dryRun ? "Checking" : "Migrating"} ${targets.length} tenant(s) against ${entries.length} local migration(s)…`,
	);

	let failures = 0;
	for (const t of targets) {
		if (t.status === "suspended") {
			console.log(`- ${t.slug}: suspended, skipped`);
			continue;
		}

		const client = createClient({
			url: t.dbUrl,
			authToken: t.dbAuthToken ?? undefined,
		});
		try {
			const pending = await pendingFor(client, entries);
			if (pending.length === 0) {
				console.log(`✓ ${t.slug}: up to date`);
				continue;
			}

			const names = pending.map((p) => p.tag).join(", ");
			if (dryRun) {
				console.log(`… ${t.slug}: ${pending.length} pending → ${names}`);
				continue;
			}

			console.log(
				`… ${t.slug}: applying ${pending.length} migration(s): ${names}`,
			);
			if (repair) {
				for (const entry of pending) {
					await repairMigration(client, entry);
				}
			} else {
				const tdb = drizzle(client, { schema: tenantSchema });
				await migrate(tdb, { migrationsFolder: MIGRATIONS_FOLDER });
			}
			console.log(`✓ ${t.slug}: migrated`);
		} catch (err) {
			failures++;
			console.error(
				`✗ ${t.slug}: ${err instanceof Error ? err.message : String(err)}`,
			);
		} finally {
			client.close();
		}
	}

	if (failures > 0) {
		console.error(`\n${failures} tenant(s) failed.`);
		process.exit(1);
	}
	console.log("✅ Done");
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
