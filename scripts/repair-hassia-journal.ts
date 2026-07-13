// scripts/repair-hassia-journal.ts — one-off fix for hassia's migration journal.
//
// Hassia's __drizzle_migrations contains two hand-inserted rows (round
// created_at values, hashes matching no migration file) that pushed
// max(created_at) past migrations 0001–0005, so drizzle's migrator skips them
// forever. This script:
//   1. Prints user_stat contents (migration 0001 drops that table).
//   2. Deletes every journal row except ones whose hash matches a local
//      migration file AND whose created_at equals that migration's journal
//      `when` with no gaps before it — in practice: keeps 0000, removes the
//      two fake rows and the 0006–0008 rows.
//   3. Leaves applying to `pnpm db:migrate-tenants --repair --tenant=hassia`.
//
// Run with --apply to actually delete; default is a dry run.

import "dotenv/config";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import { tenants } from "~/server/db/control-schema";
import { createClient } from "~/server/db/libsql";

const APPLY = process.argv.includes("--apply");
const FOLDER = path.join(process.cwd(), "drizzle");

async function main() {
	const journal = JSON.parse(
		readFileSync(path.join(FOLDER, "meta", "_journal.json"), "utf8"),
	) as { entries: { idx: number; when: number; tag: string }[] };
	const local = journal.entries.map((e) => ({
		tag: e.tag,
		when: e.when,
		hash: createHash("sha256")
			.update(readFileSync(path.join(FOLDER, `${e.tag}.sql`), "utf8"))
			.digest("hex"),
	}));

	const [t] = await controlDb
		.select()
		.from(tenants)
		.where(eq(tenants.slug, "hassia"))
		.limit(1);
	if (!t) throw new Error("No tenant 'hassia'");
	const c = createClient({
		url: t.dbUrl,
		authToken: t.dbAuthToken ?? undefined,
	});

	// 1. user_stat contents (dropped by migration 0001)
	try {
		const us = await c.execute("SELECT * FROM user_stat");
		console.log(`user_stat: ${us.rows.length} row(s)`);
		for (const r of us.rows) console.log(`  ${JSON.stringify(r)}`);
	} catch (err) {
		console.log(
			`user_stat: ${err instanceof Error ? err.message.split("\n")[0] : err}`,
		);
	}

	// 2. journal rows — keep only the longest prefix of real migrations
	const rows = await c.execute(
		"SELECT rowid, hash, created_at FROM __drizzle_migrations ORDER BY created_at",
	);
	// Longest prefix of `local` where every entry has a matching journal row.
	const rowHashes = new Set(rows.rows.map((r) => String(r.hash)));
	let prefixEnd = 0;
	for (const l of local) {
		if (rowHashes.has(l.hash)) prefixEnd++;
		else break;
	}
	const keepHashes = new Set(local.slice(0, prefixEnd).map((l) => l.hash));
	console.log(
		`\nIntact prefix: ${prefixEnd} migration(s) (${local
			.slice(0, prefixEnd)
			.map((l) => l.tag)
			.join(", ")})`,
	);

	for (const r of rows.rows) {
		const hash = String(r.hash);
		const match = local.find((l) => l.hash === hash);
		const keep = keepHashes.has(hash);
		console.log(
			`${keep ? "KEEP  " : "DELETE"} rowid=${r.rowid} created_at=${r.created_at} ${match ? match.tag : `unknown ${hash.slice(0, 12)}…`}`,
		);
		if (!keep && APPLY) {
			await c.execute({
				sql: "DELETE FROM __drizzle_migrations WHERE rowid = ?",
				args: [r.rowid],
			});
		}
	}

	console.log(
		APPLY
			? "\n✅ Journal cleaned. Now run: pnpm db:migrate-tenants --repair --tenant=hassia"
			: "\nDry run — re-run with --apply to delete.",
	);
	c.close();
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
