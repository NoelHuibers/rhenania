// seed.ts — the achievement catalogue and every user's achievements from
// their history, for one tenant DB.
//
//   pnpm db:seed <tenant-id>
//
// DATABASE_URL must be that tenant's database (it is PRODUCTION in `.env`;
// run through `scripts/dev/run.ts` for the local files). The tenant id
// decides which cross-Corps games count and the founding day. Runs with the
// `react-server` condition, like the app's server code it calls.

import "dotenv/config";
import { seedAchievements } from "~/lib/achievements/version1";
import { users } from "~/server/db/schema";
import { getScriptDb } from "~/server/db/script";
import { tenantScope } from "~/server/lib/tenant-scope";
import { recalculateAllAchievements } from "~/server/modules/achievements/tracking";

async function main() {
	const tenantId = process.argv[2];
	if (!tenantId) {
		console.error("Usage: pnpm db:seed <tenant-id>");
		process.exit(2);
	}
	const { db } = getScriptDb();
	const tenant = tenantScope(tenantId, db);
	await seedAchievements(db);

	const allUsers = await db
		.select({ id: users.id, name: users.name })
		.from(users);
	console.log(`👤 Seeding achievements for ${allUsers.length} users...`);

	for (const user of allUsers) {
		console.log(`  → ${user.name ?? user.id}`);
		await recalculateAllAchievements(tenant, user.id);
	}

	console.log("✅ Done");
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
