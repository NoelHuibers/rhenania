// seed.ts — the achievement catalogue and every user's achievements from
// their history, for one tenant.
//
//   pnpm db:seed <tenant-id or slug>
//
// The tenant is looked up in the control DB and seeded in its own database,
// so the cross-Corps games and the founding day always belong to the DB
// being written. A remote (production) tenant DB needs CONFIRM_PROD=<host>;
// run through `scripts/dev/run.ts` for the local files. Runs with the
// `react-server` condition, like the app's server code it calls.

import "dotenv/config";
import { eq, or } from "drizzle-orm";
import { seedAchievements } from "~/lib/achievements/version1";
import { controlDb } from "~/server/db/control";
import { tenants } from "~/server/db/control-schema";
import { users } from "~/server/db/schema";
import { getTenantDb } from "~/server/db/tenants";
import { tenantScope } from "~/server/lib/tenant-scope";
import { recalculateAllAchievements } from "~/server/modules/achievements/tracking";
import { guardOrExit } from "../../../scripts/lib/guard";

async function main() {
	const ref = process.argv[2];
	if (!ref) {
		console.error("Usage: pnpm db:seed <tenant-id or slug>");
		process.exit(2);
	}
	const [tenant] = await controlDb
		.select({ id: tenants.id, slug: tenants.slug, dbUrl: tenants.dbUrl })
		.from(tenants)
		.where(or(eq(tenants.id, ref), eq(tenants.slug, ref)))
		.limit(1);
	if (!tenant) {
		console.error(`No tenant with id or slug '${ref}'.`);
		process.exit(1);
	}
	guardOrExit(tenant.dbUrl, `seed achievements for '${tenant.slug}'`);
	console.log(`🏠 Tenant ${tenant.slug} (${tenant.id})`);

	const db = await getTenantDb(tenant.id);
	const scope = tenantScope(tenant.id, db);
	await seedAchievements(db);

	const allUsers = await db
		.select({ id: users.id, name: users.name })
		.from(users);
	console.log(`👤 Seeding achievements for ${allUsers.length} users...`);

	for (const user of allUsers) {
		console.log(`  → ${user.name ?? user.id}`);
		await recalculateAllAchievements(scope, user.id);
	}

	console.log("✅ Done");
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
