// scripts/ops/deploy-migrate.ts — migrate production as part of the deploy.
//
// Vercel's build command (vercel.json) is
//
//   pnpm build && pnpm db:migrate:deploy
//
// so a production deployment goes: build the code → migrate the control DB →
// migrate every tenant DB (canary first) → Vercel promotes the deployment.
// Any failure fails the build: the running deployment stays live and new code
// never serves traffic on an old schema. Preview and local builds skip this.
//
// Safety rails, in order:
//   - only VERCEL_ENV=production migrates (deployMode)
//   - CONFIRM_PROD must name the control DB host (scripts/lib/guard.ts); set
//     it in Vercel for the Production environment only
//   - a lease in the control DB serialises overlapping production builds
//   - control DB first, then tenants with the canary (MIGRATION_CANARY,
//     default "rhenania") first; a canary failure stops the rollout
//   - each DB logs a PITR anchor before it is touched and has its journal
//     verified against the shipped files afterwards
//   - CI only lets additive migrations through without `migration:contract`
//     (scripts/ci/check-migrations.ts): the old deployment keeps serving on
//     the new schema until the promotion
//
//   pnpm db:migrate:deploy --dry-run   # what a production deploy would apply

import "dotenv/config";

import os from "node:os";
import path from "node:path";
import { env } from "~/env";
import { controlDb } from "~/server/db/control";
import { tenants } from "~/server/db/control-schema";
import { createClient } from "~/server/db/libsql";
import { guardOrExit } from "../lib/guard";
import {
	acquireDeployLock,
	deployMode,
	releaseDeployLock,
} from "./lib/deploy-migrations";
import {
	runTenantMigrations,
	summaryMarkdown,
	type TenantResult,
	type TenantTarget,
} from "./lib/tenant-migrations";

const dryRun = process.argv.includes("--dry-run");

async function main() {
	if (!dryRun) {
		const mode = deployMode(process.env);
		if (!mode.run) {
			console.log(`Deploy migrations skipped (${mode.reason}).`);
			return;
		}
		guardOrExit(env.CONTROL_DATABASE_URL, "run deploy migrations");
	}

	const holder = [
		process.env.VERCEL_DEPLOYMENT_ID ?? process.env.VERCEL_URL ?? os.hostname(),
		process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
	]
		.filter(Boolean)
		.join("@");
	const lockClient = createClient({
		url: env.CONTROL_DATABASE_URL,
		authToken: env.CONTROL_DATABASE_AUTH_TOKEN,
	});

	if (!dryRun) {
		await acquireDeployLock(lockClient, holder);
		console.log(`Deploy lock acquired by ${holder}.`);
	}
	try {
		const control = await migrateControl();
		const tenantRun = control.failed
			? { results: [] as TenantResult[], failed: true }
			: await migrateTenants();

		const all = [...control.results, ...tenantRun.results];
		console.log(`\n${summaryMarkdown(all)}\n`);
		// One machine-readable line per deploy for the build log / log drain.
		console.log(
			JSON.stringify({
				event: "deploy-migrations",
				dryRun,
				holder,
				commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
				failed: control.failed || tenantRun.failed,
				databases: all.map(
					({ slug, outcome, before, after, pitrAnchor, error }) => ({
						slug,
						outcome,
						before,
						after,
						pitrAnchor,
						error,
					}),
				),
			}),
		);
		if (control.failed || tenantRun.failed) {
			console.error(
				"\nDeploy migrations failed; the deployment will not be promoted. Restore points are in the PITR anchor column.",
			);
			process.exitCode = 1;
		}
	} finally {
		if (!dryRun) {
			await releaseDeployLock(lockClient, holder);
		}
		lockClient.close();
	}
}

/** The control DB, through the same runner (pending check, PITR anchor, verify). */
function migrateControl() {
	const target: TenantTarget = {
		slug: "control",
		status: "active",
		dbUrl: env.CONTROL_DATABASE_URL,
		dbAuthToken: env.CONTROL_DATABASE_AUTH_TOKEN ?? null,
	};
	return runTenantMigrations([target], {
		migrationsFolder: path.join(process.cwd(), "drizzle", "control"),
		openClient: (t) =>
			createClient({ url: t.dbUrl, authToken: t.dbAuthToken ?? undefined }),
		dryRun,
		haltOnError: true,
	});
}

async function migrateTenants() {
	const targets = await controlDb
		.select({
			slug: tenants.slug,
			status: tenants.status,
			dbUrl: tenants.dbUrl,
			dbAuthToken: tenants.dbAuthToken,
		})
		.from(tenants);
	const canary = (process.env.MIGRATION_CANARY ?? "rhenania")
		.split(",")
		.map((s) => s.trim())
		.filter((slug) => targets.some((t) => t.slug === slug));
	return runTenantMigrations(targets, {
		migrationsFolder: path.join(process.cwd(), "drizzle"),
		openClient: (t) =>
			createClient({ url: t.dbUrl, authToken: t.dbAuthToken ?? undefined }),
		dryRun,
		canary,
		haltOnError: true,
	});
}

main()
	.catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	})
	.finally(() => {
		// libSQL clients keep the event loop alive.
		setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref();
	});
