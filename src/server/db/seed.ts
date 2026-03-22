import "dotenv/config";
import { seedAchievements } from "~/lib/achievements/version1";
import { recalculateAllAchievements } from "~/server/actions/achievements/tracking";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";

async function main() {
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

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
