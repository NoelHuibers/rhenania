// scripts/migrate-userstats-to-control.ts
//
// One-shot: copy each user's `user_stat` row from the existing tenant DB
// (Rhenania, accessed via DATABASE_URL) into the control DB's unified
// `control_user_stat` table.
//
// Run AFTER `pnpm db:control:migrate` (which creates the new table) and
// BEFORE `pnpm db:migrate` (which drops the tenant `user_stat` table).
//
// Idempotent: uses ON CONFLICT DO NOTHING on userId, so re-running won't
// overwrite data already in the control DB. If you need to re-import,
// truncate `control_user_stat` first.
//
//   pnpm tsx scripts/migrate-userstats-to-control.ts

import "dotenv/config";

import { createClient } from "@libsql/client";

import { env } from "~/env";
import { controlDb } from "~/server/db/control";
import { userStats } from "~/server/db/control-schema";

const tenantClient = createClient({
	url: env.DATABASE_URL,
	authToken: env.DATABASE_AUTH_TOKEN,
});

function toDate(v: unknown): Date | null {
	if (v == null) return null;
	if (typeof v === "number") return new Date(v * 1000);
	if (typeof v === "string") {
		const n = Number(v);
		if (!Number.isNaN(n)) return new Date(n * 1000);
		return new Date(v);
	}
	if (v instanceof Date) return v;
	return null;
}

async function main() {
	const rs = await tenantClient.execute("SELECT * FROM user_stat");
	console.log(`Found ${rs.rows.length} user_stat rows in tenant DB.`);
	if (rs.rows.length === 0) {
		console.log("Nothing to migrate.");
		process.exit(0);
	}

	const now = new Date();
	const rows = rs.rows.map((r) => ({
		userId: String(r.userId),
		currentElo: Number(r.currentElo ?? 1200),
		totalGames: Number(r.totalGames ?? 0),
		wins: Number(r.wins ?? 0),
		losses: Number(r.losses ?? 0),
		peakElo: Number(r.peakElo ?? 1200),
		lastGameAt: toDate(r.lastGameAt),
		createdAt: toDate(r.createdAt) ?? now,
		updatedAt: toDate(r.updatedAt) ?? now,
	}));

	await controlDb
		.insert(userStats)
		.values(rows)
		.onConflictDoNothing({ target: userStats.userId });

	console.log(
		`✅ Inserted up to ${rows.length} userStats rows into control DB.`,
	);
	console.log("   (existing rows preserved by onConflictDoNothing)");
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
