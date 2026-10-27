// scripts/ops/reconcile-user-mirror.ts — repair the tenant `user` mirror
// from the control DB (#35).
//
// For every membership the tenant DB must have a `user` row with the
// identity's current name, e-mail and image. The live writes retry and log,
// but a tenant DB that is down at the wrong moment still leaves drift; the
// superadmin health table and /api/health/tenants show it per tenant.
// Rows of former members stay untouched (history references them). Details
// in src/server/lib/user-mirror-reconcile.ts.
//
// Dry run (default, read-only) prints what would change; --apply writes.
// Idempotent: a second run reports nothing to do.
//
//   pnpm ops:reconcile-user-mirror [slug]            # dry run, all tenants or one
//   CONFIRM_PROD=<db-host> pnpm ops:reconcile-user-mirror [slug] --apply

import "dotenv/config";

import { drizzle } from "drizzle-orm/libsql";

import { controlDb } from "~/server/db/control";
import { tenants } from "~/server/db/control-schema";
import * as schema from "~/server/db/schema";
import {
	inSync,
	type ReconcileReport,
	reconcileUserMirror,
} from "~/server/lib/user-mirror-reconcile";
import { guardOrExit } from "../lib/guard";
import { findTenantBySlug, openTenantClient } from "../lib/tenants";

function print(slug: string, r: ReconcileReport) {
	const verb = r.applied ? "" : "would be ";
	console.log(
		`${slug}: ${r.members} member(s), ${inSync(r) ? "in sync" : "drift"}`,
	);
	for (const id of r.inserted) {
		console.log(`  + ${id}\t${verb}inserted`);
	}
	for (const u of r.updated) {
		console.log(`  ~ ${u.userId}\t${verb}updated: ${u.fields.join(", ")}`);
	}
	for (const x of r.released) {
		console.log(
			`  - ${x.userId}\tformer member, e-mail ${x.email} ${verb}released`,
		);
	}
	for (const id of r.missingIdentity) {
		console.log(`  ! ${id}\tmembership without a control-DB user (skipped)`);
	}
}

async function main() {
	const args = process.argv.slice(2);
	const apply = args.includes("--apply");
	const rest = args.filter((a) => a !== "--apply");
	if (rest.length > 1 || rest[0]?.startsWith("-")) {
		console.error("Usage: pnpm ops:reconcile-user-mirror [slug] [--apply]");
		process.exit(1);
	}
	const targets = rest[0]
		? [await findTenantBySlug(rest[0])]
		: await controlDb.select().from(tenants).orderBy(tenants.slug);

	let drifted = 0;
	for (const tenant of targets) {
		if (apply) {
			guardOrExit(
				tenant.dbUrl,
				`reconcile the user mirror of '${tenant.slug}'`,
			);
		}
		// A raw client instead of getTenantDb: suspended tenants count too.
		const client = openTenantClient(tenant);
		try {
			const report = await reconcileUserMirror(
				drizzle(client, { schema }),
				controlDb,
				tenant.id,
				{ dryRun: !apply },
			);
			print(tenant.slug, report);
			if (!inSync(report)) {
				drifted++;
			}
		} finally {
			client.close();
		}
	}

	if (!apply && drifted > 0) {
		console.log(
			`\nDry run: nothing written. ${drifted} tenant(s) drifted; re-run with --apply to repair.`,
		);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
