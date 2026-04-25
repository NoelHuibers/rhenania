// scripts/seed-control.ts
//
// Idempotent seed for the control plane DB. Registers Rhenania as tenant #1,
// points it at the existing Rhenania Turso DB (current DATABASE_URL), maps the
// production hostnames + localhost to it, sets up an auth-config row from
// current Azure env vars, and back-fills `tenantMemberships` from every user
// in the Rhenania DB.
//
// Run after `pnpm db:control:migrate`:
//   pnpm db:control:seed

import "dotenv/config";

import { eq, sql } from "drizzle-orm";

import { env } from "~/env";
import { db } from "~/server/db";
import { controlDb } from "~/server/db/control";
import {
	tenantAuthConfig,
	tenantDomains,
	tenantMemberships,
	tenants,
} from "~/server/db/control-schema";
import { users } from "~/server/db/schema";

const RHENANIA_SLUG = "rhenania";
const RHENANIA_DISPLAY_NAME = "Corps Rhenania Stuttgart";
const RHENANIA_HOSTNAMES: Array<{
	hostname: string;
	isPrimary: boolean;
	isCustom: boolean;
}> = [
	{ hostname: "rhenania-stuttgart.de", isPrimary: true, isCustom: true },
	{ hostname: "www.rhenania-stuttgart.de", isPrimary: false, isCustom: true },
	{ hostname: "localhost", isPrimary: false, isCustom: false },
];

async function upsertTenant(): Promise<string> {
	const [existing] = await controlDb
		.select({ id: tenants.id })
		.from(tenants)
		.where(eq(tenants.slug, RHENANIA_SLUG))
		.limit(1);

	if (existing) {
		await controlDb
			.update(tenants)
			.set({
				displayName: RHENANIA_DISPLAY_NAME,
				dbUrl: env.DATABASE_URL,
				dbAuthToken: env.DATABASE_AUTH_TOKEN ?? null,
				status: "active",
			})
			.where(eq(tenants.id, existing.id));
		console.log(`✓ tenant '${RHENANIA_SLUG}' updated (${existing.id})`);
		return existing.id;
	}

	const [inserted] = await controlDb
		.insert(tenants)
		.values({
			slug: RHENANIA_SLUG,
			displayName: RHENANIA_DISPLAY_NAME,
			status: "active",
			dbUrl: env.DATABASE_URL,
			dbAuthToken: env.DATABASE_AUTH_TOKEN ?? null,
		})
		.returning({ id: tenants.id });

	if (!inserted) throw new Error("Failed to insert Rhenania tenant");
	console.log(`✓ tenant '${RHENANIA_SLUG}' inserted (${inserted.id})`);
	return inserted.id;
}

async function upsertDomains(tenantId: string) {
	for (const d of RHENANIA_HOSTNAMES) {
		const [existing] = await controlDb
			.select({ id: tenantDomains.id, tenantId: tenantDomains.tenantId })
			.from(tenantDomains)
			.where(eq(tenantDomains.hostname, d.hostname))
			.limit(1);

		if (existing) {
			if (existing.tenantId !== tenantId) {
				throw new Error(
					`Hostname '${d.hostname}' already maps to tenant ${existing.tenantId}, refusing to overwrite`,
				);
			}
			await controlDb
				.update(tenantDomains)
				.set({ isPrimary: d.isPrimary, isCustom: d.isCustom })
				.where(eq(tenantDomains.id, existing.id));
			console.log(`  ✓ domain ${d.hostname} (existing)`);
			continue;
		}

		await controlDb.insert(tenantDomains).values({
			tenantId,
			hostname: d.hostname,
			isPrimary: d.isPrimary,
			isCustom: d.isCustom,
			verifiedAt: new Date(),
		});
		console.log(`  ✓ domain ${d.hostname} (inserted)`);
	}
}

async function upsertAuthConfig(tenantId: string) {
	const microsoftEnabled = Boolean(
		env.AZURE_AD_CLIENT_ID &&
			env.AZURE_AD_CLIENT_SECRET &&
			env.AZURE_AD_TENANT_ID,
	);

	const [existing] = await controlDb
		.select({ tenantId: tenantAuthConfig.tenantId })
		.from(tenantAuthConfig)
		.where(eq(tenantAuthConfig.tenantId, tenantId))
		.limit(1);

	const values = {
		emailPasswordEnabled: true,
		microsoftEnabled,
		azureClientId: env.AZURE_AD_CLIENT_ID ?? null,
		azureClientSecret: env.AZURE_AD_CLIENT_SECRET ?? null,
		azureTenantId: env.AZURE_AD_TENANT_ID ?? null,
	};

	if (existing) {
		await controlDb
			.update(tenantAuthConfig)
			.set(values)
			.where(eq(tenantAuthConfig.tenantId, tenantId));
		console.log(`  ✓ auth config (microsoft=${microsoftEnabled}, updated)`);
		return;
	}

	await controlDb.insert(tenantAuthConfig).values({ tenantId, ...values });
	console.log(`  ✓ auth config (microsoft=${microsoftEnabled}, inserted)`);
}

async function backfillMemberships(tenantId: string) {
	const allUsers = await db.select({ id: users.id }).from(users);
	console.log(`  → backfilling ${allUsers.length} memberships`);

	if (allUsers.length === 0) return;

	const rows = allUsers.map((u) => ({
		userId: u.id,
		tenantId,
		status: "active" as const,
	}));

	// SQLite/libSQL conflict target = composite PK (userId, tenantId)
	await controlDb
		.insert(tenantMemberships)
		.values(rows)
		.onConflictDoNothing({
			target: [tenantMemberships.userId, tenantMemberships.tenantId],
		});

	const [row] = await controlDb
		.select({ count: sql<number>`count(*)` })
		.from(tenantMemberships)
		.where(eq(tenantMemberships.tenantId, tenantId));
	console.log(`  ✓ memberships now: ${row?.count ?? 0}`);
}

async function main() {
	console.log("Seeding control plane DB…");
	const tenantId = await upsertTenant();
	await upsertDomains(tenantId);
	await upsertAuthConfig(tenantId);
	await backfillMemberships(tenantId);
	console.log("✅ Done");
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
