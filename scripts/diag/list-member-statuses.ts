// scripts/list-member-statuses.ts — read-only: distinct member.status values
// per tenant with counts. Usage: pnpm tsx scripts/list-member-statuses.ts [slug]

import "dotenv/config";

import { eq } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import { tenants } from "~/server/db/control-schema";
import { createClient } from "~/server/db/libsql";

const slug = process.argv[2] ?? "rhenania";

async function main() {
	const [t] = await controlDb
		.select()
		.from(tenants)
		.where(eq(tenants.slug, slug))
		.limit(1);
	if (!t) throw new Error(`No tenant '${slug}'`);
	const c = createClient({
		url: t.dbUrl,
		authToken: t.dbAuthToken ?? undefined,
	});
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
