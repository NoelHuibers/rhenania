// scripts/ops/lib/tenant-migrations.ts — roll drizzle migrations out to N
// tenant databases safely. Used by scripts/ops/migrate-tenants.ts; kept free
// of env/CLI concerns so it can be tested against local libSQL files.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Client, InStatement } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

export type JournalEntry = { idx: number; when: number; tag: string };

export type TenantTarget = {
	slug: string;
	status: "active" | "suspended" | "pending";
	dbUrl: string;
	dbAuthToken: string | null;
};

export type TenantResult = {
	slug: string;
	outcome: "up-to-date" | "pending" | "migrated" | "failed" | "skipped";
	/** Journal head before the run (tag of the newest applied migration). */
	before: string | null;
	after: string | null;
	pending: string[];
	/** Timestamp to restore to with Turso point-in-time recovery. */
	pitrAnchor?: string;
	error?: string;
	note?: string;
	durationMs: number;
};

export type RunOptions = {
	migrationsFolder: string;
	openClient: (target: TenantTarget) => Client;
	dryRun?: boolean;
	repair?: boolean;
	/** Slugs migrated first; any canary failure stops the rollout. */
	canary?: string[];
	/** Stop at the first failure (default in CI). */
	haltOnError?: boolean;
	skipSuspended?: boolean;
	log?: (line: string) => void;
	now?: () => Date;
};

type LocalMigration = JournalEntry & { sql: string; hash: string };

export function readLocalMigrations(folder: string): LocalMigration[] {
	const journal = JSON.parse(
		readFileSync(path.join(folder, "meta", "_journal.json"), "utf8"),
	) as { entries: JournalEntry[] };
	return journal.entries.map((entry) => {
		const sql = readFileSync(path.join(folder, `${entry.tag}.sql`), "utf8");
		return {
			...entry,
			sql,
			hash: sha256(sql),
		};
	});
}

async function hasJournalTable(client: Client) {
	const rs = await client.execute(
		"SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
	);
	return rs.rows.length > 0;
}

/** Mirrors drizzle's pending check: newer `when` than the newest applied row. */
export async function pendingFor(
	client: Client,
	local: LocalMigration[],
): Promise<LocalMigration[]> {
	if (!(await hasJournalTable(client))) {
		return local;
	}
	const rs = await client.execute(
		"SELECT max(created_at) AS last FROM __drizzle_migrations",
	);
	const last = Number(rs.rows[0]?.last ?? 0);
	return local.filter((m) => m.when > last);
}

export async function journalHead(
	client: Client,
	local: LocalMigration[],
): Promise<string | null> {
	if (!(await hasJournalTable(client))) {
		return null;
	}
	const rs = await client.execute(
		"SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1",
	);
	const row = rs.rows[0];
	if (!row) {
		return null;
	}
	return (
		local.find((m) => m.hash === row.hash)?.tag ??
		`unknown (created_at=${String(row.created_at)})`
	);
}

const sha256 = (text: string) =>
	createHash("sha256").update(text).digest("hex");

/**
 * Hashes a recorded row may carry for this file. Early tenants were migrated
 * from a checkout with Windows line endings, so their rows hold the hash of
 * the CRLF copy of the same SQL.
 */
function acceptedHashes(m: LocalMigration): Set<string> {
	return new Set([m.hash, sha256(m.sql.replace(/\r?\n/g, "\r\n"))]);
}

/**
 * After a run, every local migration up to the newest applied one must be
 * recorded with the hash of the file we ship. Rows are matched by hash first:
 * migrations applied by older scripts carry their own timestamps, not the
 * journal's. Returns the problems found.
 */
export async function verifyJournal(
	client: Client,
	local: LocalMigration[],
): Promise<string[]> {
	if (!(await hasJournalTable(client))) {
		return ["no __drizzle_migrations table"];
	}
	const rs = await client.execute(
		"SELECT hash, created_at FROM __drizzle_migrations",
	);
	const applied = rs.rows.map((r) => ({
		hash: String(r.hash),
		when: Number(r.created_at),
	}));
	const last = Math.max(0, ...applied.map((a) => a.when));
	const problems: string[] = [];
	for (const m of local.filter((l) => l.when <= last)) {
		const hashes = acceptedHashes(m);
		if (applied.some((a) => hashes.has(a.hash))) {
			continue;
		}
		const row = applied.find((a) => a.when === m.when);
		if (!row) {
			problems.push(`${m.tag} is not recorded`);
		} else if (row.hash !== m.hash) {
			problems.push(`${m.tag} was recorded with a different hash`);
		}
	}
	return problems;
}

// ─── --repair ────────────────────────────────────────────────────────────────

async function objectExists(
	client: Client,
	type: "table" | "index",
	name: string,
) {
	const rs = await client.execute({
		sql: "SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?",
		args: [type, name],
	});
	return rs.rows.length > 0;
}

async function columnExists(client: Client, table: string, column: string) {
	if (!(await objectExists(client, "table", table))) {
		return false;
	}
	const rs = await client.execute(
		`PRAGMA table_info(\`${table.replaceAll("`", "")}\`)`,
	);
	return rs.rows.some((r) => r.name === column);
}

/** True when the statement's object already exists (schema ran ahead). */
export async function alreadyApplied(
	client: Client,
	statement: string,
): Promise<boolean> {
	const table = /^CREATE TABLE (?:IF NOT EXISTS )?`([^`]+)`/i.exec(statement);
	if (table?.[1]) {
		return objectExists(client, "table", table[1]);
	}
	const index = /^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?`([^`]+)`/i.exec(
		statement,
	);
	if (index?.[1]) {
		return objectExists(client, "index", index[1]);
	}
	const column = /^ALTER TABLE `([^`]+)` ADD (?:COLUMN )?`([^`]+)`/i.exec(
		statement,
	);
	if (column?.[1] && column[2]) {
		return columnExists(client, column[1], column[2]);
	}
	return false;
}

/**
 * Applies one migration for a DB whose schema ran ahead of its journal:
 * statements whose objects already exist are skipped (decided by inspecting
 * the schema, not by swallowing errors), everything else plus the journal
 * row runs in ONE write batch — so a failure leaves the DB unchanged.
 */
export async function repairMigration(client: Client, m: LocalMigration) {
	const statements = m.sql
		.split(/-->\s*statement-breakpoint/)
		.map((s) => s.trim())
		.filter(Boolean);
	const toRun: InStatement[] = [];
	let skipped = 0;
	for (const statement of statements) {
		if (await alreadyApplied(client, statement)) {
			skipped++;
		} else {
			toRun.push(statement);
		}
	}
	toRun.push(
		"CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)",
		{
			sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
			args: [m.hash, m.when],
		},
	);
	await client.batch(toRun, "write");
	return { applied: toRun.length - 2, skipped };
}

// ─── Rollout ─────────────────────────────────────────────────────────────────

export function orderTargets(targets: TenantTarget[], canary: string[] = []) {
	const first = canary
		.map((slug) => targets.find((t) => t.slug === slug))
		.filter((t): t is TenantTarget => Boolean(t));
	return [...first, ...targets.filter((t) => !canary.includes(t.slug))];
}

export async function runTenantMigrations(
	targets: TenantTarget[],
	opts: RunOptions,
): Promise<{ results: TenantResult[]; failed: boolean }> {
	const log = opts.log ?? console.log;
	const now = opts.now ?? (() => new Date());
	const local = readLocalMigrations(opts.migrationsFolder);
	const canary = opts.canary ?? [];
	const missingCanary = canary.filter(
		(slug) => !targets.some((t) => t.slug === slug),
	);
	if (missingCanary.length > 0) {
		throw new Error(`Unknown canary tenant(s): ${missingCanary.join(", ")}`);
	}

	const results: TenantResult[] = [];
	let halted: string | null = null;

	for (const target of orderTargets(targets, canary)) {
		const started = Date.now();
		const result: TenantResult = {
			slug: target.slug,
			outcome: "skipped",
			before: null,
			after: null,
			pending: [],
			durationMs: 0,
		};
		results.push(result);

		if (halted) {
			result.note = `not attempted: ${halted}`;
			continue;
		}
		if (target.status === "suspended" && opts.skipSuspended) {
			result.note = "suspended (--skip-suspended)";
			log(`- ${target.slug}: suspended, skipped`);
			continue;
		}

		let client: Client | null = null;
		try {
			client = opts.openClient(target);
			result.before = await journalHead(client, local);
			const pending = await pendingFor(client, local);
			result.pending = pending.map((m) => m.tag);
			if (pending.length === 0) {
				result.outcome = "up-to-date";
				result.after = result.before;
				log(`✓ ${target.slug}: up to date (${result.before ?? "empty"})`);
				continue;
			}
			if (opts.dryRun) {
				result.outcome = "pending";
				log(
					`… ${target.slug}: ${pending.length} pending → ${result.pending.join(", ")}`,
				);
				continue;
			}

			result.pitrAnchor = now().toISOString();
			log(
				`… ${target.slug}: at ${result.before ?? "empty"}, applying ${pending.length} (PITR anchor ${result.pitrAnchor})`,
			);
			if (opts.repair) {
				for (const m of pending) {
					const { applied, skipped } = await repairMigration(client, m);
					log(
						`  ✓ ${m.tag}: ${applied} applied, ${skipped} skipped (already present)`,
					);
				}
			} else {
				await migrate(drizzle(client), {
					migrationsFolder: opts.migrationsFolder,
				});
			}

			const problems = await verifyJournal(client, local);
			result.after = await journalHead(client, local);
			if (problems.length > 0) {
				throw new Error(`journal verification failed: ${problems.join("; ")}`);
			}
			result.outcome = "migrated";
			log(`✓ ${target.slug}: migrated to ${result.after}`);
		} catch (error) {
			result.outcome = "failed";
			result.error = error instanceof Error ? error.message : String(error);
			log(`✗ ${target.slug}: ${result.error}`);
			if (canary.includes(target.slug)) {
				halted = `canary ${target.slug} failed`;
			} else if (opts.haltOnError) {
				halted = `${target.slug} failed (halt on error)`;
			}
		} finally {
			client?.close();
			result.durationMs = Date.now() - started;
		}
	}

	return { results, failed: results.some((r) => r.outcome === "failed") };
}

export function summaryMarkdown(results: TenantResult[]): string {
	const rows = results.map(
		(r) =>
			`| ${r.slug} | ${r.outcome} | ${r.before ?? "–"} | ${r.after ?? "–"} | ${r.pitrAnchor ?? "–"} | ${r.durationMs} ms | ${(r.error ?? r.note ?? "").replaceAll("|", "\\|")} |`,
	);
	return [
		"### Tenant migrations",
		"| Tenant | Outcome | Before | After | PITR anchor | Duration | Note |",
		"|---|---|---|---|---|---|---|",
		...rows,
	].join("\n");
}
