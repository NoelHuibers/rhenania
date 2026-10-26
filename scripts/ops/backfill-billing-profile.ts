// scripts/ops/backfill-billing-profile.ts
//
// One-off for #9: copies the Getränke bill sender, account holder, IBAN and
// PayPal that the code used to hard-code into the Rhenania tenant DB, so
// Rhenania's bills and profile page stay exactly as they were. Only ever
// touches the `rhenania` tenant. Other tenants enter their own data in
// Getränkewart › Kasse.
//
// Dry run by default (prints the plan, writes nothing). Idempotent: it only
// fills empty fields and only adds a konto when there is no valid one, and it
// refuses to write anything that would change what members are shown.
//
// Rollout order:
//   1. pnpm db:migrate-tenants                 (creates getraenke_billing_config)
//   2. pnpm db:backfill-billing-profile                            # dry run
//      CONFIRM_PROD=<rhenania-db-host> pnpm db:backfill-billing-profile --apply
//   3. deploy the app

import "dotenv/config";

import { getTenantDb } from "~/server/db/tenants";
import { guardOrExit } from "../lib/guard";
import { findTenantBySlug } from "../lib/tenants";
import {
	applyBillingProfileBackfill,
	describeStep,
	planBillingProfileBackfill,
} from "./lib/billing-profile-backfill";

const SLUG = "rhenania";

async function main() {
	const apply = process.argv.includes("--apply");
	const tenant = await findTenantBySlug(SLUG);
	if (apply) {
		guardOrExit(tenant.dbUrl, `backfill the billing profile of ${SLUG}`);
	}

	const tdb = await getTenantDb(tenant.id);
	const plan = await planBillingProfileBackfill(tdb, tenant.branding ?? null);

	console.log(`Tenant ${SLUG}: ${plan.steps.length} step(s)`);
	for (const step of plan.steps) {
		console.log(`  - ${describeStep(step)}`);
	}
	console.log(`  before: ${JSON.stringify(plan.before)}`);
	console.log(`  after:  ${JSON.stringify(plan.after)}`);
	for (const warning of plan.warnings) {
		console.warn(`  ! ${warning}`);
	}

	if (!plan.unchanged) {
		process.exit(1);
	}
	if (!apply) {
		console.log("Dry run; nothing written. Re-run with --apply to write.");
		process.exit(0);
	}
	await applyBillingProfileBackfill(tdb, plan);
	console.log("✅ Done");
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
