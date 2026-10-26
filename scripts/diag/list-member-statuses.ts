// scripts/diag/list-member-statuses.ts — read-only: distinct member.status values
// per tenant with counts. Usage: pnpm diag:member-statuses [slug]

import "dotenv/config";

import { openTenant } from "../lib/tenants";

const slug = process.argv[2] ?? "rhenania";

async function main() {
	const { client: c } = await openTenant(slug);
	const rs = await c.execute(
		'SELECT status, count(*) AS n FROM "member" GROUP BY status ORDER BY n DESC',
	);
	for (const r of rs.rows) console.log(`${r.n}\t${JSON.stringify(r.status)}`);
	c.close();
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
