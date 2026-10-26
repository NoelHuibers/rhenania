import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
	readLocalMigrations,
	repairMigration,
	runTenantMigrations,
	type TenantTarget,
	verifyJournal,
} from "./tenant-migrations";

let dir: string;
beforeEach(() => {
	dir = mkdtempSync(path.join(os.tmpdir(), "rhenania-migrate-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const BREAK = "\n--> statement-breakpoint\n";

/** Writes a tiny drizzle migrations folder. */
function fixtureFolder(
	migrations: Array<{ name: string; when: number; statements: string[] }>,
) {
	const folder = path.join(
		dir,
		`migrations-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(path.join(folder, "meta"), { recursive: true });
	const entries = migrations.map((m, idx) => {
		const tag = `${String(idx).padStart(4, "0")}_${m.name}`;
		writeFileSync(path.join(folder, `${tag}.sql`), m.statements.join(BREAK));
		return { idx, version: "6", when: m.when, tag, breakpoints: true };
	});
	writeFileSync(
		path.join(folder, "meta", "_journal.json"),
		JSON.stringify({ version: "7", dialect: "sqlite", entries }),
	);
	return folder;
}

const BASE = [
	{
		name: "init",
		when: 100,
		statements: ["CREATE TABLE `a` (`id` integer PRIMARY KEY)"],
	},
	{
		name: "more",
		when: 200,
		statements: [
			"CREATE TABLE `b` (`id` integer PRIMARY KEY)",
			"ALTER TABLE `a` ADD `c` text",
			"CREATE INDEX `a_c_idx` ON `a` (`c`)",
		],
	},
];

function target(
	slug: string,
	status: TenantTarget["status"] = "active",
): TenantTarget {
	return {
		slug,
		status,
		dbUrl: `file:${path.join(dir, `${slug}.db`)}`,
		dbAuthToken: null,
	};
}

const open = (t: TenantTarget) => createClient({ url: t.dbUrl });
const quiet = () => {};

async function tables(t: TenantTarget) {
	const client = open(t);
	const rs = await client.execute(
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
	);
	client.close();
	return rs.rows.map((r) => String(r.name));
}

describe("runTenantMigrations", () => {
	test("applies the real drizzle migrations to an empty tenant and verifies them", async () => {
		const t = target("fresh");
		const { results, failed } = await runTenantMigrations([t], {
			migrationsFolder: path.resolve("drizzle"),
			openClient: open,
			log: quiet,
			now: () => new Date("2026-10-26T12:00:00Z"),
		});

		expect(failed).toBe(false);
		const local = readLocalMigrations(path.resolve("drizzle"));
		expect(results[0]).toMatchObject({
			outcome: "migrated",
			before: null,
			after: local.at(-1)?.tag,
			pitrAnchor: "2026-10-26T12:00:00.000Z",
		});
		expect(await tables(t)).toContain("drink");

		const again = await runTenantMigrations([t], {
			migrationsFolder: path.resolve("drizzle"),
			openClient: open,
			log: quiet,
		});
		expect(again.results[0]?.outcome).toBe("up-to-date");
	});

	test("dry run reports pending migrations without changing anything", async () => {
		const folder = fixtureFolder(BASE);
		const t = target("dry");
		const { results } = await runTenantMigrations([t], {
			migrationsFolder: folder,
			openClient: open,
			dryRun: true,
			log: quiet,
		});
		expect(results[0]).toMatchObject({
			outcome: "pending",
			pending: ["0000_init", "0001_more"],
		});
		expect(await tables(t)).toEqual([]);
	});

	test("a failing canary stops the rollout before any other tenant", async () => {
		const folder = fixtureFolder(BASE);
		const broken: TenantTarget = {
			...target("canary"),
			dbUrl: `file:${path.join(dir, "missing-dir", "x.db")}`,
		};
		const other = target("other");

		const { results, failed } = await runTenantMigrations([other, broken], {
			migrationsFolder: folder,
			openClient: open,
			canary: ["canary"],
			log: quiet,
		});

		expect(failed).toBe(true);
		expect(results.map((r) => [r.slug, r.outcome])).toEqual([
			["canary", "failed"],
			["other", "skipped"],
		]);
		expect(results[1]?.note).toMatch(/canary canary failed/);
		expect(await tables(other)).toEqual([]);
	});

	test("without halt-on-error the remaining tenants still run; with it they don't", async () => {
		const folder = fixtureFolder(BASE);
		const broken: TenantTarget = {
			...target("broken"),
			dbUrl: `file:${path.join(dir, "missing-dir", "x.db")}`,
		};

		const keepGoing = await runTenantMigrations([broken, target("ok1")], {
			migrationsFolder: folder,
			openClient: open,
			log: quiet,
		});
		expect(keepGoing.results.map((r) => r.outcome)).toEqual([
			"failed",
			"migrated",
		]);

		const halt = await runTenantMigrations([broken, target("ok2")], {
			migrationsFolder: folder,
			openClient: open,
			haltOnError: true,
			log: quiet,
		});
		expect(halt.results.map((r) => r.outcome)).toEqual(["failed", "skipped"]);
	});

	test("suspended tenants are migrated unless --skip-suspended", async () => {
		const folder = fixtureFolder(BASE);
		const a = target("sleepy-a", "suspended");
		const b = target("sleepy-b", "suspended");

		const migrated = await runTenantMigrations([a], {
			migrationsFolder: folder,
			openClient: open,
			log: quiet,
		});
		expect(migrated.results[0]?.outcome).toBe("migrated");

		const skipped = await runTenantMigrations([b], {
			migrationsFolder: folder,
			openClient: open,
			skipSuspended: true,
			log: quiet,
		});
		expect(skipped.results[0]?.outcome).toBe("skipped");
	});

	test("rejects unknown canary slugs", async () => {
		await expect(
			runTenantMigrations([target("x")], {
				migrationsFolder: fixtureFolder(BASE),
				openClient: open,
				canary: ["typo"],
				log: quiet,
			}),
		).rejects.toThrow(/Unknown canary/);
	});
});

describe("repair", () => {
	async function tenantAtInit(folder: string, t: TenantTarget) {
		await runTenantMigrations([t], {
			migrationsFolder: fixtureFolder([BASE[0] as (typeof BASE)[number]]),
			openClient: open,
			log: quiet,
		});
		return readLocalMigrations(folder);
	}

	test("skips objects that already exist and records the journal row", async () => {
		const folder = fixtureFolder(BASE);
		const t = target("ahead");
		await tenantAtInit(folder, t);
		const client = open(t);
		// Schema ran ahead of the journal: `b` already exists.
		await client.execute("CREATE TABLE `b` (`id` integer PRIMARY KEY)");
		client.close();

		const { results } = await runTenantMigrations([t], {
			migrationsFolder: folder,
			openClient: open,
			repair: true,
			log: quiet,
		});

		expect(results[0]).toMatchObject({
			outcome: "migrated",
			before: "0000_init",
			after: "0001_more",
		});
		const check = open(t);
		const cols = await check.execute("PRAGMA table_info(`a`)");
		expect(cols.rows.map((r) => r.name)).toContain("c");
		check.close();
	});

	test("a failing statement leaves the tenant unchanged (atomic)", async () => {
		const folder = fixtureFolder([
			BASE[0] as (typeof BASE)[number],
			{
				name: "broken",
				when: 200,
				statements: [
					"ALTER TABLE `a` ADD `c` text",
					"INSERT INTO `does_not_exist` VALUES (1)",
				],
			},
		]);
		const t = target("atomic");
		const local = await tenantAtInit(folder, t);
		const client = open(t);

		await expect(
			repairMigration(client, local[1] as (typeof local)[number]),
		).rejects.toThrow();

		const cols = await client.execute("PRAGMA table_info(`a`)");
		expect(cols.rows.map((r) => r.name)).not.toContain("c");
		const journal = await client.execute(
			"SELECT count(*) AS n FROM __drizzle_migrations",
		);
		expect(Number(journal.rows[0]?.n)).toBe(1);
		client.close();
	});
});

describe("verifyJournal", () => {
	test("detects a recorded hash that doesn't match the shipped file", async () => {
		const folder = fixtureFolder(BASE);
		const t = target("tampered");
		await runTenantMigrations([t], {
			migrationsFolder: folder,
			openClient: open,
			log: quiet,
		});
		const client = open(t);
		await client.execute(
			"UPDATE __drizzle_migrations SET hash = 'nope' WHERE created_at = 100",
		);

		expect(await verifyJournal(client, readLocalMigrations(folder))).toEqual([
			"0000_init was recorded with a different hash",
		]);
		client.close();
	});

	test("accepts rows from older scripts with their own timestamps", async () => {
		const folder = fixtureFolder(BASE);
		const t = target("legacy-times");
		await runTenantMigrations([t], {
			migrationsFolder: folder,
			openClient: open,
			log: quiet,
		});
		const client = open(t);
		// Applied by an old one-off script: same SQL, its own created_at.
		await client.execute(
			"UPDATE __drizzle_migrations SET created_at = 90 WHERE created_at = 100",
		);
		// Plus a row for a migration that is not in the repo any more.
		await client.execute(
			"INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('old-one-off', 95)",
		);

		expect(await verifyJournal(client, readLocalMigrations(folder))).toEqual(
			[],
		);
		client.close();
	});

	test("accepts the hash of the same SQL with Windows line endings", async () => {
		const folder = fixtureFolder(BASE);
		const t = target("crlf");
		await runTenantMigrations([t], {
			migrationsFolder: folder,
			openClient: open,
			log: quiet,
		});
		// The multi-statement migration, so the SQL really has line breaks.
		const more = readLocalMigrations(folder).find((m) => m.when === 200);
		if (!more?.sql.includes("\n")) {
			throw new Error("fixture migration without line breaks");
		}
		const crlf = createHash("sha256")
			.update(more.sql.replace(/\r?\n/g, "\r\n"))
			.digest("hex");
		const client = open(t);
		await client.execute({
			sql: "UPDATE __drizzle_migrations SET hash = ? WHERE created_at = ?",
			args: [crlf, more.when],
		});

		expect(await verifyJournal(client, readLocalMigrations(folder))).toEqual(
			[],
		);
		client.close();
	});
});
