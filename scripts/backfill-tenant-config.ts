// scripts/backfill-tenant-config.ts
//
// Seeds (or repairs) the per-tenant config tables — kasseTypes, eventTypes,
// homepageSections — for an existing tenant DB. Idempotent: uses
// ON CONFLICT DO NOTHING on each table's `key`, so re-running just adds any
// rows that are missing.
//
// Defaults to the Rhenania tenant. Pass --tenant=<slug> to target a different
// one; pass --all to seed every active tenant.
//
// Run AFTER `pnpm db:migrate` (which creates the empty config tables):
//   pnpm tsx scripts/backfill-tenant-config.ts                 # rhenania
//   pnpm tsx scripts/backfill-tenant-config.ts --tenant=hassia
//   pnpm tsx scripts/backfill-tenant-config.ts --all

import "dotenv/config";

import { eq } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import { tenants } from "~/server/db/control-schema";
import {
	eventTypes,
	homepageSections,
	kasseTypes,
	memberStatuses,
} from "~/server/db/schema";
import { getTenantDb } from "~/server/db/tenants";
import {
	DEFAULT_EVENT_TYPES,
	DEFAULT_HOMEPAGE_SECTIONS,
	DEFAULT_KASSE_TYPES,
	DEFAULT_MEMBER_STATUSES,
} from "~/server/lib/tenant-default-config";

function parseArgs() {
	const args = process.argv.slice(2);
	const all = args.includes("--all");
	const tenantArg = args.find((a) => a.startsWith("--tenant="));
	const slug = tenantArg ? tenantArg.split("=")[1] : "rhenania";
	return { all, slug };
}

async function backfillForTenant(tenantId: string, slug: string) {
	const tdb = await getTenantDb(tenantId);

	const inserted = { kasse: 0, events: 0, sections: 0, statuses: 0 };

	for (const k of DEFAULT_KASSE_TYPES) {
		const r = await tdb
			.insert(kasseTypes)
			.values(k)
			.onConflictDoNothing({ target: kasseTypes.key });
		inserted.kasse += r.rowsAffected ?? 0;
	}

	for (const e of DEFAULT_EVENT_TYPES) {
		const r = await tdb
			.insert(eventTypes)
			.values(e)
			.onConflictDoNothing({ target: eventTypes.key });
		inserted.events += r.rowsAffected ?? 0;
	}

	for (const s of DEFAULT_HOMEPAGE_SECTIONS) {
		const r = await tdb
			.insert(homepageSections)
			.values(s)
			.onConflictDoNothing({ target: homepageSections.key });
		inserted.sections += r.rowsAffected ?? 0;
	}

	for (const m of DEFAULT_MEMBER_STATUSES) {
		const r = await tdb
			.insert(memberStatuses)
			.values(m)
			.onConflictDoNothing({ target: memberStatuses.key });
		inserted.statuses += r.rowsAffected ?? 0;
	}

	console.log(
		`  ${slug}: kasseTypes +${inserted.kasse}, eventTypes +${inserted.events}, homepageSections +${inserted.sections}, memberStatuses +${inserted.statuses}`,
	);
}

async function main() {
	const { all, slug } = parseArgs();

	const targets = all
		? await controlDb
				.select({ id: tenants.id, slug: tenants.slug, status: tenants.status })
				.from(tenants)
		: await controlDb
				.select({ id: tenants.id, slug: tenants.slug, status: tenants.status })
				.from(tenants)
				.where(eq(tenants.slug, slug ?? "rhenania"));

	const active = targets.filter((t) => t.status !== "suspended");
	if (active.length === 0) {
		console.error("No matching active tenant(s) found.");
		process.exit(1);
	}

	console.log(`Backfilling config defaults for ${active.length} tenant(s)…`);
	for (const t of active) {
		await backfillForTenant(t.id, t.slug);
	}
	console.log("✅ Done");
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
