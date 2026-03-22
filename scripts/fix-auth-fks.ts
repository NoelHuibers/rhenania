/**
 * Fix FK references after Better Auth migration.
 *
 * SQLite 3.26+ auto-updates FK references when you rename a table, so after
 * renaming rhenania_user → rhenania_user_old, all child tables got their FKs
 * updated to rhenania_user_old. This script recreates those tables with the
 * correct FK pointing to rhenania_user, then drops the _old tables.
 *
 * Run after migrate-auth.ts:
 *   pnpm tsx scripts/fix-auth-fks.ts
 */

import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const client = createClient({
	url: process.env.DATABASE_URL ?? "",
	authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function run(statement: string) {
	await client.execute(statement);
}

/**
 * Rebuild a table by:
 *  1. Creating a _fixed clone with the corrected FK
 *  2. Copying all rows (FK check passes because user IDs exist in rhenania_user)
 *  3. Dropping the original
 *  4. Renaming _fixed → original
 */
async function rebuildTable(
	tableName: string,
	createFixed: string,
	columns: string,
) {
	console.log(`  Rebuilding ${tableName}…`);
	await run(createFixed);
	await run(
		`INSERT INTO ${tableName}_fixed (${columns}) SELECT ${columns} FROM ${tableName}`,
	);
	await run(`DROP TABLE ${tableName}`);
	await run(`ALTER TABLE ${tableName}_fixed RENAME TO ${tableName}`);
	console.log(`  ✓ ${tableName}`);
}

async function main() {
	console.log("Fixing FK references to rhenania_user_old…\n");

	// ── rhenania_user_role ────────────────────────────────────────────────────
	await rebuildTable(
		"rhenania_user_role",
		`CREATE TABLE rhenania_user_role_fixed (
      userId     text(255) NOT NULL,
      roleId     text(255) NOT NULL,
      assignedAt integer   DEFAULT (unixepoch()),
      assignedBy text(255),
      PRIMARY KEY (userId, roleId),
      FOREIGN KEY (userId) REFERENCES rhenania_user(id) ON DELETE CASCADE,
      FOREIGN KEY (roleId) REFERENCES rhenania_role(id) ON DELETE CASCADE
    )`,
		"userId, roleId, assignedAt, assignedBy",
	);

	// ── rhenania_user_preference ──────────────────────────────────────────────
	await rebuildTable(
		"rhenania_user_preference",
		`CREATE TABLE rhenania_user_preference_fixed (
      userId    text(255) NOT NULL,
      key       text(100) NOT NULL,
      value     text      NOT NULL,
      valueType text      NOT NULL DEFAULT 'json',
      createdAt integer   DEFAULT (unixepoch()),
      updatedAt integer   DEFAULT (unixepoch()),
      PRIMARY KEY (userId, key),
      FOREIGN KEY (userId) REFERENCES rhenania_user(id) ON DELETE CASCADE
    )`,
		"userId, key, value, valueType, createdAt, updatedAt",
	);

	// ── rhenania_user_stat ────────────────────────────────────────────────────
	await rebuildTable(
		"rhenania_user_stat",
		`CREATE TABLE rhenania_user_stat_fixed (
      id          text(255) NOT NULL PRIMARY KEY,
      userId      text(255) NOT NULL,
      currentElo  integer   NOT NULL DEFAULT 1200,
      totalGames  integer   NOT NULL DEFAULT 0,
      wins        integer   NOT NULL DEFAULT 0,
      losses      integer   NOT NULL DEFAULT 0,
      lastGameAt  integer,
      peakElo     integer   NOT NULL DEFAULT 1200,
      createdAt   integer   NOT NULL,
      updatedAt   integer   NOT NULL,
      FOREIGN KEY (userId) REFERENCES rhenania_user(id)
    )`,
		"id, userId, currentElo, totalGames, wins, losses, lastGameAt, peakElo, createdAt, updatedAt",
	);

	// ── rhenania_user_achievement ─────────────────────────────────────────────
	await rebuildTable(
		"rhenania_user_achievement",
		`CREATE TABLE rhenania_user_achievement_fixed (
      id               text(255) NOT NULL PRIMARY KEY,
      userId           text(255) NOT NULL,
      achievementId    text(255) NOT NULL,
      unlockedAt       integer   NOT NULL,
      progress         integer   NOT NULL DEFAULT 0,
      notificationSent integer   NOT NULL DEFAULT false,
      FOREIGN KEY (userId)        REFERENCES rhenania_user(id)        ON DELETE CASCADE,
      FOREIGN KEY (achievementId) REFERENCES rhenania_achievement(id) ON DELETE CASCADE
    )`,
		"id, userId, achievementId, unlockedAt, progress, notificationSent",
	);

	// ── rhenania_achievement_progress ─────────────────────────────────────────
	await rebuildTable(
		"rhenania_achievement_progress",
		`CREATE TABLE rhenania_achievement_progress_fixed (
      id            text(255) NOT NULL PRIMARY KEY,
      userId        text(255) NOT NULL,
      achievementId text(255) NOT NULL,
      currentValue  integer   NOT NULL DEFAULT 0,
      metadata      text,
      lastUpdated   integer   NOT NULL,
      FOREIGN KEY (userId)        REFERENCES rhenania_user(id)        ON DELETE CASCADE,
      FOREIGN KEY (achievementId) REFERENCES rhenania_achievement(id) ON DELETE CASCADE
    )`,
		"id, userId, achievementId, currentValue, metadata, lastUpdated",
	);

	// ── rhenania_game ─────────────────────────────────────────────────────────
	await rebuildTable(
		"rhenania_game",
		`CREATE TABLE rhenania_game_fixed (
      id              text(255) NOT NULL PRIMARY KEY,
      player1Id       text(255) NOT NULL,
      player2Id       text(255) NOT NULL,
      winnerId        text(255) NOT NULL,
      playedAt        integer   NOT NULL,
      player1EloBefore integer  DEFAULT 1200,
      player2EloBefore integer  DEFAULT 1200,
      player1EloAfter  integer  DEFAULT 1200,
      player2EloAfter  integer  DEFAULT 1200,
      orderId         text(255),
      gameType        text(50)  DEFAULT 'bierjunge',
      FOREIGN KEY (player1Id) REFERENCES rhenania_user(id),
      FOREIGN KEY (player2Id) REFERENCES rhenania_user(id),
      FOREIGN KEY (winnerId)  REFERENCES rhenania_user(id)
    )`,
		"id, player1Id, player2Id, winnerId, playedAt, player1EloBefore, player2EloBefore, player1EloAfter, player2EloAfter, orderId, gameType",
	);

	// ── rhenania_homepage_image ───────────────────────────────────────────────
	await rebuildTable(
		"rhenania_homepage_image",
		`CREATE TABLE rhenania_homepage_image_fixed (
      id           text(255) NOT NULL PRIMARY KEY,
      section      text      NOT NULL,
      imageUrl     text      NOT NULL,
      imageName    text(255) NOT NULL,
      fileSize     integer,
      mimeType     text(50),
      displayOrder integer   NOT NULL DEFAULT 0,
      isActive     integer   NOT NULL DEFAULT true,
      uploadedBy   text(255),
      createdAt    integer   NOT NULL DEFAULT (unixepoch()),
      updatedAt    integer,
      FOREIGN KEY (uploadedBy) REFERENCES rhenania_user(id)
    )`,
		"id, section, imageUrl, imageName, fileSize, mimeType, displayOrder, isActive, uploadedBy, createdAt, updatedAt",
	);

	// ── rhenania_inventory (has incoming FK from rhenania_inventory_item) ─────
	console.log(
		"  Rebuilding rhenania_inventory (with inventory_item handling)…",
	);

	// 1. Backup inventory_item rows (no FKs in backup table)
	await run(`
    CREATE TABLE rhenania_inventory_item_bak AS
    SELECT * FROM rhenania_inventory_item
  `);

	// 2. Drop inventory_item (unblocks inventory drop)
	await run("DROP TABLE rhenania_inventory_item");

	// 3. Rebuild inventory with correct FK
	await run(`
    CREATE TABLE rhenania_inventory_fixed (
      id          text(255) NOT NULL PRIMARY KEY,
      status      text      NOT NULL DEFAULT 'active',
      totalLoss   real      NOT NULL DEFAULT 0,
      performedBy text(255),
      createdAt   integer   NOT NULL DEFAULT (unixepoch()),
      closedAt    integer,
      FOREIGN KEY (performedBy) REFERENCES rhenania_user(id)
    )
  `);
	await run(
		"INSERT INTO rhenania_inventory_fixed (id, status, totalLoss, performedBy, createdAt, closedAt) SELECT id, status, totalLoss, performedBy, createdAt, closedAt FROM rhenania_inventory",
	);
	await run("DROP TABLE rhenania_inventory");
	await run(
		"ALTER TABLE rhenania_inventory_fixed RENAME TO rhenania_inventory",
	);

	// 4. Recreate inventory_item with correct FK
	await run(`
    CREATE TABLE rhenania_inventory_item (
      id              text(255) NOT NULL PRIMARY KEY,
      inventoryId     text(255) NOT NULL,
      drinkId         text(255) NOT NULL,
      countedStock    integer   NOT NULL,
      previousStock   integer   NOT NULL DEFAULT 0,
      purchasedSince  integer   NOT NULL DEFAULT 0,
      soldSince       integer   NOT NULL DEFAULT 0,
      priceAtCount    real      NOT NULL,
      lossValue       real      NOT NULL DEFAULT 0,
      FOREIGN KEY (inventoryId) REFERENCES rhenania_inventory(id) ON DELETE CASCADE,
      FOREIGN KEY (drinkId)     REFERENCES rhenania_drink(id)
    )
  `);
	await run(
		"INSERT INTO rhenania_inventory_item SELECT id, inventoryId, drinkId, countedStock, previousStock, purchasedSince, soldSince, priceAtCount, lossValue FROM rhenania_inventory_item_bak",
	);
	await run("DROP TABLE rhenania_inventory_item_bak");

	console.log("  ✓ rhenania_inventory + rhenania_inventory_item");

	// ── Drop old auth tables ──────────────────────────────────────────────────
	console.log("\nDropping old auth tables…");
	await run("DROP TABLE IF EXISTS rhenania_account_old");
	await run("DROP TABLE IF EXISTS rhenania_user_old");
	console.log("  ✓ rhenania_account_old dropped");
	console.log("  ✓ rhenania_user_old dropped");

	console.log("\n✅  FK fix complete! All tables now reference rhenania_user.");
}

main().catch((err) => {
	console.error("FK fix failed:", err);
	process.exit(1);
});
