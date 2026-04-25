// scripts/rename-microsoft-accounts.ts
//
// One-shot: rename legacy `accounts.providerId = "microsoft"` rows (left over
// from before per-tenant Microsoft providers existed) to the new per-tenant
// providerId `microsoft-<tenantSlug>`.
//
// Idempotent. Only renames an account when the owning user has exactly ONE
// tenant membership whose tenant has Microsoft enabled — otherwise the
// rename is ambiguous (which tenant's Azure app does this OAuth link belong
// to?) and the row is logged and skipped for manual review.
//
//   pnpm tsx scripts/rename-microsoft-accounts.ts          # dry-run
//   pnpm tsx scripts/rename-microsoft-accounts.ts --apply  # actually update

import "dotenv/config";

import { eq, inArray } from "drizzle-orm";

import { microsoftProviderIdForSlug } from "~/server/auth/load-providers";
import { controlDb } from "~/server/db/control";
import {
	accounts,
	tenantAuthConfig,
	tenantMemberships,
	tenants,
} from "~/server/db/control-schema";

const apply = process.argv.includes("--apply");

type Plan =
	| { kind: "rename"; accountId: string; userId: string; from: string; to: string }
	| { kind: "skip"; accountId: string; userId: string; reason: string };

async function buildPlan(): Promise<Plan[]> {
	const legacy = await controlDb
		.select({
			id: accounts.id,
			userId: accounts.userId,
		})
		.from(accounts)
		.where(eq(accounts.providerId, "microsoft"));

	if (legacy.length === 0) return [];

	const userIds = Array.from(new Set(legacy.map((a) => a.userId)));

	const memberships = await controlDb
		.select({
			userId: tenantMemberships.userId,
			tenantId: tenantMemberships.tenantId,
			tenantSlug: tenants.slug,
			tenantStatus: tenants.status,
			microsoftEnabled: tenantAuthConfig.microsoftEnabled,
		})
		.from(tenantMemberships)
		.innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
		.leftJoin(
			tenantAuthConfig,
			eq(tenantAuthConfig.tenantId, tenantMemberships.tenantId),
		)
		.where(inArray(tenantMemberships.userId, userIds));

	const eligibleByUser = new Map<string, string[]>();
	for (const m of memberships) {
		if (m.tenantStatus === "suspended") continue;
		if (!m.microsoftEnabled) continue;
		const list = eligibleByUser.get(m.userId) ?? [];
		list.push(m.tenantSlug);
		eligibleByUser.set(m.userId, list);
	}

	const plan: Plan[] = [];
	for (const acc of legacy) {
		const slugs = eligibleByUser.get(acc.userId) ?? [];
		if (slugs.length === 0) {
			plan.push({
				kind: "skip",
				accountId: acc.id,
				userId: acc.userId,
				reason: "no active membership in a Microsoft-enabled tenant",
			});
			continue;
		}
		if (slugs.length > 1) {
			plan.push({
				kind: "skip",
				accountId: acc.id,
				userId: acc.userId,
				reason: `ambiguous: user belongs to ${slugs.length} Microsoft-enabled tenants (${slugs.join(", ")})`,
			});
			continue;
		}
		const slug = slugs[0];
		if (!slug) continue;
		plan.push({
			kind: "rename",
			accountId: acc.id,
			userId: acc.userId,
			from: "microsoft",
			to: microsoftProviderIdForSlug(slug),
		});
	}

	return plan;
}

async function main() {
	const plan = await buildPlan();

	if (plan.length === 0) {
		console.log(
			"No legacy 'microsoft' accounts found — nothing to do.",
		);
		process.exit(0);
	}

	const renames = plan.filter((p) => p.kind === "rename");
	const skips = plan.filter((p) => p.kind === "skip");

	console.log(
		`Plan: ${renames.length} rename(s), ${skips.length} skip(s).`,
	);
	for (const r of renames) {
		console.log(`  → rename account ${r.accountId} (user ${r.userId}): ${r.from} → ${r.to}`);
	}
	for (const s of skips) {
		console.log(`  ⚠ skip account ${s.accountId} (user ${s.userId}): ${s.reason}`);
	}

	if (!apply) {
		console.log("\nDry-run only. Re-run with --apply to commit changes.");
		process.exit(0);
	}

	for (const r of renames) {
		await controlDb
			.update(accounts)
			.set({ providerId: r.to, updatedAt: new Date() })
			.where(eq(accounts.id, r.accountId));
	}

	console.log(`\n✅ Applied ${renames.length} rename(s).`);
	if (skips.length > 0) {
		console.log(
			`${skips.length} row(s) require manual review (see above).`,
		);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
