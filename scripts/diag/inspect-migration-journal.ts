// scripts/diag/inspect-migration-journal.ts — read-only: compare a tenant's
// __drizzle_migrations rows against the local drizzle journal + file hashes.
// Usage: pnpm diag:migration-journal [slug]

import "dotenv/config";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { openTenant } from "../lib/tenants";

const slug = process.argv[2] ?? "hassia";
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

	const { client } = await openTenant(slug);
	const rs = await client.execute(
		"SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id",
	);
	client.close();

	console.log(`--- ${slug}: ${rs.rows.length} recorded migrations ---`);
	for (const row of rs.rows) {
		const match = local.find((l) => l.hash === row.hash);
		console.log(
			`#${row.id} created_at=${row.created_at} ${match ? `= ${match.tag}` : `UNKNOWN hash ${String(row.hash).slice(0, 12)}…`}`,
		);
	}
	console.log(`--- local journal (${local.length}) ---`);
	for (const l of local) {
		const applied = rs.rows.some((r) => r.hash === l.hash);
		console.log(`${l.tag} when=${l.when} ${applied ? "APPLIED" : "MISSING"}`);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
