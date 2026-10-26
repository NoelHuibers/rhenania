// scripts/diag/duplicate-settlements.ts — read-only: challenges that were
// settled more than once (several game rows for one challengeId) before the
// settlement claim existed. Each extra game also applied ELO again and, for
// in-Corps challenges, booked the drink orders again.
// Usage: pnpm diag:duplicate-settlements [slug]

import "dotenv/config";

import { eq } from "drizzle-orm";

import { controlClient, controlDb } from "~/server/db/control";
import { tenants } from "~/server/db/control-schema";
import { openTenantClient } from "../lib/tenants";

// One line per duplicated challenge; the first game is the legitimate one.
const DUPLICATES_SQL = (table: string) => `
	SELECT "challengeId",
	       count(*) AS games,
	       group_concat("id", ' ') AS gameIds,
	       datetime(min("playedAt"), 'unixepoch') AS firstPlayedAt,
	       datetime(max("playedAt"), 'unixepoch') AS lastPlayedAt
	FROM "${table}"
	WHERE "challengeId" IS NOT NULL
	GROUP BY "challengeId"
	HAVING count(*) > 1
	ORDER BY min("playedAt")`;

async function main() {
	const slug = process.argv[2];
	const rows = await controlDb
		.select()
		.from(tenants)
		.where(slug ? eq(tenants.slug, slug) : undefined);

	for (const tenant of rows) {
		const client = openTenantClient(tenant);
		const rs = await client.execute(DUPLICATES_SQL("game"));
		console.log(`${tenant.slug}: ${rs.rows.length} duplicated challenge(s)`);
		for (const r of rs.rows) {
			console.log(
				`  ${r.challengeId}\t${r.games} games\t${r.firstPlayedAt} .. ${r.lastPlayedAt}\t${r.gameIds}`,
			);
		}
		client.close();
	}

	const cross = await controlClient.execute(
		DUPLICATES_SQL("control_cross_tenant_game"),
	);
	console.log(`cross-Corps: ${cross.rows.length} duplicated challenge(s)`);
	for (const r of cross.rows) {
		console.log(
			`  ${r.challengeId}\t${r.games} games\t${r.firstPlayedAt} .. ${r.lastPlayedAt}\t${r.gameIds}`,
		);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
