// scripts/ops/migrate-tenants.ts
//
// Brings every tenant DB up to date with the migrations in ./drizzle (the
// same folder `provisionTenant` runs against brand-new tenants). Idempotent:
// drizzle only applies journal entries newer than the last row in each
// tenant's __drizzle_migrations table.
//
//   pnpm db:migrate-tenants --dry-run              # pending migrations per tenant
//   pnpm db:migrate-tenants                        # apply to all tenants
//   pnpm db:migrate-tenants --tenant=hassia        # one tenant
//   pnpm db:migrate-tenants --canary=rhenania      # canary first; its failure stops all
//   pnpm db:migrate-tenants --halt-on-error        # stop at the first failure (default in CI)
//   pnpm db:migrate-tenants --skip-suspended       # suspended tenants are migrated by default
//   pnpm db:migrate-tenants --repair               # schema ran ahead of the journal
//   pnpm db:migrate-tenants --json                 # machine-readable results on stdout
//
// Before touching a tenant it logs the journal head and a PITR timestamp
// (restore point); afterwards it verifies the recorded hashes against the
// files shipped in ./drizzle. `--repair` skips statements whose objects
// already exist (decided by inspecting the schema) and applies the rest
// plus the journal row atomically. Writes to remote DBs need CONFIRM_PROD
// (see scripts/lib/guard.ts). Exit code 1 if any tenant failed.

import "dotenv/config";

import { appendFileSync } from "node:fs";
import path from "node:path";

import { controlDb } from "~/server/db/control";
import { tenants } from "~/server/db/control-schema";
import { createClient } from "~/server/db/libsql";
import { guardOrExit } from "../lib/guard";
import { runTenantMigrations, summaryMarkdown } from "./lib/tenant-migrations";

function parseArgs(argv: string[]) {
	const value = (name: string) =>
		argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
	const list = (name: string) =>
		(value(name) ?? "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
	return {
		dryRun: argv.includes("--dry-run"),
		repair: argv.includes("--repair"),
		json: argv.includes("--json"),
		skipSuspended: argv.includes("--skip-suspended"),
		haltOnError: argv.includes("--halt-on-error")
			? true
			: argv.includes("--no-halt")
				? false
				: Boolean(process.env.CI),
		slugs: list("tenant"),
		canary: list("canary"),
	};
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (!args.dryRun) {
		guardOrExit(process.env.CONTROL_DATABASE_URL, "migrate tenant databases");
	}

	const rows = await controlDb
		.select({
			slug: tenants.slug,
			status: tenants.status,
			dbUrl: tenants.dbUrl,
			dbAuthToken: tenants.dbAuthToken,
		})
		.from(tenants);
	const targets =
		args.slugs.length > 0
			? rows.filter((t) => args.slugs.includes(t.slug))
			: rows;
	if (targets.length === 0) {
		console.error(
			args.slugs.length
				? `No tenant with slug ${args.slugs.join(", ")}.`
				: "No tenants found.",
		);
		process.exit(1);
	}

	const log = args.json ? (line: string) => console.error(line) : console.log;
	log(`${args.dryRun ? "Checking" : "Migrating"} ${targets.length} tenant(s)…`);
	const { results, failed } = await runTenantMigrations(targets, {
		migrationsFolder: path.join(process.cwd(), "drizzle"),
		openClient: (t) =>
			createClient({ url: t.dbUrl, authToken: t.dbAuthToken ?? undefined }),
		dryRun: args.dryRun,
		repair: args.repair,
		canary: args.canary,
		haltOnError: args.haltOnError,
		skipSuspended: args.skipSuspended,
		log,
	});

	if (args.json) {
		console.log(JSON.stringify(results, null, 2));
	}
	if (process.env.GITHUB_STEP_SUMMARY) {
		appendFileSync(
			process.env.GITHUB_STEP_SUMMARY,
			`${summaryMarkdown(results)}\n`,
		);
	}
	if (failed) {
		log(
			`\n${results.filter((r) => r.outcome === "failed").length} tenant(s) failed.`,
		);
		process.exit(1);
	}
	log("✅ Done");
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
