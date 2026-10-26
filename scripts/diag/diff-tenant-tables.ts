// scripts/diag/diff-tenant-tables.ts — read-only: diff table lists of two tenant DBs.
// Usage: pnpm diag:diff-tables [slugA] [slugB]

import "dotenv/config";

import { openTenant } from "../lib/tenants";

async function tablesOf(slug: string): Promise<Set<string>> {
	const { client } = await openTenant(slug);
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
