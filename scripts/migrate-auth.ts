/**
 * Better Auth migration script
 *
 * Migrates the NextAuth v5 schema to Better Auth schema:
 *
 *  users      – emailVerified: timestamp → boolean, remove password,
 *               add createdAt / updatedAt
 *  accounts   – complete restructure (id, accountId, providerId, …)
 *               OAuth rows are transformed in place;
 *               credential accounts are created from users.password
 *  sessions   – old sessions are dropped (users will re-login);
 *               new Better Auth session shape is created
 *  verifications – new Better Auth internal table is created empty
 *  verificationTokens – kept as-is (custom invitation flow)
 *  passwordResetTokens – kept as-is (custom reset flow)
 *
 * Run BEFORE applying the new Drizzle schema:
 *   pnpm tsx scripts/migrate-auth.ts
 */

import { createClient } from "@libsql/client";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" }); // fallback if vars are in .env

const client = createClient({
	url: process.env.DATABASE_URL ?? "",
	authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function run(statement: string) {
	await client.execute(statement);
}

async function tableExists(name: string): Promise<boolean> {
	const result = await client.execute(
		`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`,
	);
	return result.rows.length > 0;
}

async function main() {
	console.log("Starting Better Auth migration…");

	const alreadyMigrated = await tableExists("rhenania_user_old");

	if (alreadyMigrated) {
		console.log(
			"Steps 1–4 were already completed (rhenania_user_old exists). Running cleanup only…",
		);
		await client.batch(
			[
				"PRAGMA foreign_keys = OFF",
				"DROP TABLE IF EXISTS rhenania_account_old",
				"DROP TABLE IF EXISTS rhenania_user_old",
				"PRAGMA foreign_keys = ON",
			],
			"deferred",
		);
		console.log("\n✅  Cleanup complete!");
		return;
	}

	// Disable FK checks so we can rename tables freely
	await run("PRAGMA foreign_keys = OFF");

	// ────────────────────────────────────────────────────────────────────────
	// 1. USERS – rename old, create new, copy with conversions, drop old
	// ────────────────────────────────────────────────────────────────────────
	console.log("Migrating users table…");

	await run(
		"ALTER TABLE rhenania_user RENAME TO rhenania_user_old",
	);

	await run(`
    CREATE TABLE rhenania_user (
      id         TEXT(255) NOT NULL PRIMARY KEY,
      name       TEXT(255),
      email      TEXT(255) NOT NULL UNIQUE,
      emailVerified INTEGER NOT NULL DEFAULT 0,
      image      TEXT(255),
      createdAt  INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt  INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

	await run(`
    INSERT INTO rhenania_user (id, name, email, emailVerified, image, createdAt, updatedAt)
    SELECT
      id,
      name,
      email,
      CASE WHEN emailVerified IS NOT NULL THEN 1 ELSE 0 END,
      image,
      unixepoch(),
      unixepoch()
    FROM rhenania_user_old
  `);

	console.log("  ✓ users copied");

	// ────────────────────────────────────────────────────────────────────────
	// 2. ACCOUNTS – rename old, create new Better Auth shape, copy data
	// ────────────────────────────────────────────────────────────────────────
	console.log("Migrating accounts table…");

	await run(
		"ALTER TABLE rhenania_account RENAME TO rhenania_account_old",
	);

	await run(`
    CREATE TABLE rhenania_account (
      id                     TEXT(255) NOT NULL PRIMARY KEY,
      accountId              TEXT(255) NOT NULL,
      providerId             TEXT(255) NOT NULL,
      userId                 TEXT(255) NOT NULL REFERENCES rhenania_user(id),
      accessToken            TEXT,
      refreshToken           TEXT,
      idToken                TEXT,
      accessTokenExpiresAt   INTEGER,
      refreshTokenExpiresAt  INTEGER,
      scope                  TEXT(255),
      password               TEXT(255),
      createdAt              INTEGER NOT NULL DEFAULT (unixepoch()),
      updatedAt              INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

	// OAuth accounts (microsoft-entra-id, etc.)
	// Old columns: userId, type, provider, providerAccountId,
	//              access_token, refresh_token, expires_at, id_token, scope
	await run(`
    INSERT INTO rhenania_account
      (id, accountId, providerId, userId, accessToken, refreshToken, idToken,
       accessTokenExpiresAt, scope, createdAt, updatedAt)
    SELECT
      lower(hex(randomblob(16))),
      providerAccountId,
      provider,
      userId,
      access_token,
      refresh_token,
      id_token,
      expires_at,
      scope,
      unixepoch(),
      unixepoch()
    FROM rhenania_account_old
    WHERE type = 'oauth'
  `);

	// Credential accounts – created from users.password (bcrypt hashes stay valid)
	// Better Auth uses email as accountId for credential accounts
	await run(`
    INSERT INTO rhenania_account
      (id, accountId, providerId, userId, password, createdAt, updatedAt)
    SELECT
      lower(hex(randomblob(16))),
      email,
      'credential',
      id,
      password,
      unixepoch(),
      unixepoch()
    FROM rhenania_user_old
    WHERE password IS NOT NULL
  `);

	console.log("  ✓ accounts migrated (OAuth + credential)");

	// ────────────────────────────────────────────────────────────────────────
	// 3. SESSIONS – old sessions invalidated; create new empty table
	// ────────────────────────────────────────────────────────────────────────
	console.log("Migrating sessions table (old sessions will be invalidated)…");

	await run(
		"DROP TABLE IF EXISTS rhenania_session",
	);

	await run(`
    CREATE TABLE rhenania_session (
      id          TEXT(255) NOT NULL PRIMARY KEY,
      expiresAt   INTEGER   NOT NULL,
      token       TEXT(255) NOT NULL UNIQUE,
      createdAt   INTEGER   NOT NULL DEFAULT (unixepoch()),
      updatedAt   INTEGER   NOT NULL DEFAULT (unixepoch()),
      ipAddress   TEXT(255),
      userAgent   TEXT(255),
      userId      TEXT(255) NOT NULL REFERENCES rhenania_user(id)
    )
  `);

	console.log("  ✓ sessions table recreated (all users must re-login)");

	// ────────────────────────────────────────────────────────────────────────
	// 4. VERIFICATIONS – new Better Auth internal table
	// ────────────────────────────────────────────────────────────────────────
	console.log("Creating verifications table…");

	await run(`
    CREATE TABLE IF NOT EXISTS rhenania_verification (
      id          TEXT(255) NOT NULL PRIMARY KEY,
      identifier  TEXT(255) NOT NULL,
      value       TEXT(255) NOT NULL,
      expiresAt   INTEGER   NOT NULL,
      createdAt   INTEGER   DEFAULT (unixepoch()),
      updatedAt   INTEGER   DEFAULT (unixepoch())
    )
  `);

	console.log("  ✓ verifications table created");

	// ────────────────────────────────────────────────────────────────────────
	// 5. CLEAN UP old tables
	// Use batch so FK pragma and drops share the same connection
	// ────────────────────────────────────────────────────────────────────────
	await client.batch(
		[
			"PRAGMA foreign_keys = OFF",
			"DROP TABLE IF EXISTS rhenania_account_old",
			"DROP TABLE IF EXISTS rhenania_user_old",
			"PRAGMA foreign_keys = ON",
		],
		"deferred",
	);

	console.log("\n✅  Migration complete!");
	console.log(
		"   Next steps:\n" +
			"   1. Run: pnpm db:push  (sync new Drizzle schema)\n" +
			"   2. Update .env.local: rename NEXTAUTH_URL → BETTER_AUTH_URL\n" +
			"   3. Deploy the app – all users will be asked to sign in again",
	);
}

main().catch((err) => {
	console.error("Migration failed:", err);
	process.exit(1);
});
