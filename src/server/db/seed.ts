import "dotenv/config";
import { seedAchievements } from "~/lib/achievements/version1";
import { recalculateAllAchievements } from "~/server/actions/achievements/tracking";
import { users } from "~/server/db/schema";
import { getScriptDb, runWithScriptDb } from "~/server/db/script";

async function main() {
	const { db } = getScriptDb();
	await seedAchievements();

	const allUsers = await db
		.select({ id: users.id, name: users.name })
		.from(users);
	console.log(`👤 Seeding achievements for ${allUsers.length} users...`);

	for (const user of allUsers) {
		console.log(`  → ${user.name ?? user.id}`);
		await recalculateAllAchievements(user.id);
	}

	console.log("✅ Done");
	process.exit(0);
}

// The achievement code still uses the proxy db; bind it to DATABASE_URL.
runWithScriptDb(main).catch((e) => {
	console.error(e);
	process.exit(1);
});
