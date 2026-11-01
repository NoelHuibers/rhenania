// scripts/diag/inspect-migration-journal.ts — read-only: compare a tenant's
// __drizzle_migrations rows against the local drizzle journal + file hashes.
// Usage: pnpm diag:migration-journal [slug]
//
// Rows are matched with the same hashes the migrate script accepts (incl.
// the CRLF copy early tenants were migrated from), so APPLIED/MISSING here
// agrees with `pnpm db:migrate-tenants --dry-run`.

import "dotenv/config";

import path from "node:path";
import { openTenant } from "../lib/tenants";
import {
	acceptedHashes,
	readLocalMigrations,
} from "../ops/lib/tenant-migrations";

const slug = process.argv[2] ?? "hassia";

async function main() {
	const local = readLocalMigrations(path.join(process.cwd(), "drizzle")).map(
		(m) => ({ ...m, hashes: acceptedHashes(m) }),
	);

	const { client } = await openTenant(slug);
	const rs = await client.execute(
		"SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id",
	);
	client.close();
	const rows = rs.rows.map((r) => ({
		id: r.id,
		hash: String(r.hash),
		createdAt: r.created_at,
	}));

	console.log(`--- ${slug}: ${rows.length} recorded migrations ---`);
	for (const row of rows) {
		const match = local.find((l) => l.hashes.has(row.hash));
		console.log(
			`#${row.id} created_at=${row.createdAt} ${match ? `= ${match.tag}${match.hash === row.hash ? "" : " (CRLF)"}` : `UNKNOWN hash ${row.hash.slice(0, 12)}…`}`,
		);
	}
	console.log(`--- local journal (${local.length}) ---`);
	for (const l of local) {
		const applied = rows.some((r) => l.hashes.has(r.hash));
		console.log(`${l.tag} when=${l.when} ${applied ? "APPLIED" : "MISSING"}`);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
