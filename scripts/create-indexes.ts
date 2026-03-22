/**
 * Create all indexes for tables rebuilt during the Better Auth migration.
 * Run before pnpm db:push.
 */
import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const client = createClient({
	url: process.env.DATABASE_URL ?? "",
	authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function idx(sql: string) {
	try {
		await client.execute(sql);
	} catch (e: unknown) {
		// Already exists — skip
		if (e instanceof Error && e.message.includes("already exists")) return;
		throw e;
	}
}

async function main() {
	console.log("Creating missing indexes…");

	// rhenania_account (new Better Auth shape)
	await idx(
		"CREATE INDEX IF NOT EXISTS account_user_id_idx ON rhenania_account (userId)",
	);

	// rhenania_session (new Better Auth shape)
	await idx(
		"CREATE INDEX IF NOT EXISTS session_userId_idx ON rhenania_session (userId)",
	);
	await idx(
		"CREATE UNIQUE INDEX IF NOT EXISTS rhenania_session_token_unique ON rhenania_session (token)",
	);

	// rhenania_user – email unique constraint index
	await idx(
		"CREATE UNIQUE INDEX IF NOT EXISTS rhenania_user_email_unique ON rhenania_user (email)",
	);

	// rhenania_account – accountId+providerId is not unique in BA but let's ensure the userId index name matches
	// (already created above as account_user_id_idx)

	// rhenania_user_role
	await idx(
		"CREATE INDEX IF NOT EXISTS user_roles_user_id_idx ON rhenania_user_role (userId)",
	);
	await idx(
		"CREATE INDEX IF NOT EXISTS user_roles_role_id_idx ON rhenania_user_role (roleId)",
	);

	// rhenania_user_preference
	await idx(
		"CREATE INDEX IF NOT EXISTS user_pref_user_idx ON rhenania_user_preference (userId)",
	);
	await idx(
		"CREATE INDEX IF NOT EXISTS user_pref_key_idx ON rhenania_user_preference (key)",
	);

	// rhenania_user_achievement
	await idx(
		"CREATE UNIQUE INDEX IF NOT EXISTS user_achievement_unique_idx ON rhenania_user_achievement (userId, achievementId)",
	);
	await idx(
		"CREATE INDEX IF NOT EXISTS user_achievement_user_idx ON rhenania_user_achievement (userId)",
	);
	await idx(
		"CREATE INDEX IF NOT EXISTS user_achievement_achievement_idx ON rhenania_user_achievement (achievementId)",
	);
	await idx(
		"CREATE INDEX IF NOT EXISTS user_achievement_unlocked_idx ON rhenania_user_achievement (unlockedAt)",
	);

	// rhenania_achievement_progress
	await idx(
		"CREATE UNIQUE INDEX IF NOT EXISTS achievement_progress_unique_idx ON rhenania_achievement_progress (userId, achievementId)",
	);
	await idx(
		"CREATE INDEX IF NOT EXISTS achievement_progress_user_idx ON rhenania_achievement_progress (userId)",
	);
	await idx(
		"CREATE INDEX IF NOT EXISTS achievement_progress_achievement_idx ON rhenania_achievement_progress (achievementId)",
	);

	// rhenania_homepage_image
	await idx(
		"CREATE INDEX IF NOT EXISTS homepage_image_section_idx ON rhenania_homepage_image (section)",
	);
	await idx(
		"CREATE INDEX IF NOT EXISTS homepage_image_active_idx ON rhenania_homepage_image (isActive)",
	);
	await idx(
		"CREATE INDEX IF NOT EXISTS homepage_image_order_idx ON rhenania_homepage_image (displayOrder)",
	);
	await idx(
		"CREATE INDEX IF NOT EXISTS homepage_image_section_active_idx ON rhenania_homepage_image (section, isActive)",
	);

	// rhenania_inventory
	await idx(
		"CREATE INDEX IF NOT EXISTS inventory_status_idx ON rhenania_inventory (status)",
	);

	// rhenania_inventory_item
	await idx(
		"CREATE INDEX IF NOT EXISTS inventory_item_inventory_idx ON rhenania_inventory_item (inventoryId)",
	);
	await idx(
		"CREATE INDEX IF NOT EXISTS inventory_item_drink_idx ON rhenania_inventory_item (drinkId)",
	);
	await idx(
		"CREATE UNIQUE INDEX IF NOT EXISTS inventory_item_unique_idx ON rhenania_inventory_item (inventoryId, drinkId)",
	);

	console.log("✅  All indexes created.");
}

main().catch((err) => {
	console.error("Index creation failed:", err);
	process.exit(1);
});
