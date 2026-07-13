// scripts/diff-tenant-tables.ts — read-only: diff table lists of two tenant DBs.
// Usage: pnpm tsx scripts/diff-tenant-tables.ts [slugA] [slugB]

import "dotenv/config";

import { eq } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import { tenants } from "~/server/db/control-schema";
import { createClient } from "~/server/db/libsql";

async function tablesOf(slug: string): Promise<Set<string>> {
	const [tenant] = await controlDb
		.select()
		.from(tenants)
		.where(eq(tenants.slug, slug))
		.limit(1);
	if (!tenant) throw new Error(`No tenant '${slug}'`);
	const client = createClient({
		url: tenant.dbUrl,
		authToken: tenant.dbAuthToken ?? undefined,
	});
	const rs = await client.execute(
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
	);
	client.close();
	return new Set(rs.rows.map((r) => String(r.name)));
}

async function main() {
	const a = process.argv[2] ?? "rhenania";
	const b = process.argv[3] ?? "hassia";
	const [ta, tb] = await Promise.all([tablesOf(a), tablesOf(b)]);
	console.log(`${a}: ${ta.size} tables, ${b}: ${tb.size} tables`);
	const onlyA = [...ta].filter((t) => !tb.has(t));
	const onlyB = [...tb].filter((t) => !ta.has(t));
	console.log(`only in ${a}: ${onlyA.join(", ") || "(none)"}`);
	console.log(`only in ${b}: ${onlyB.join(", ") || "(none)"}`);
	console.log(`common: ${[...ta].filter((t) => tb.has(t)).join(", ")}`);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
