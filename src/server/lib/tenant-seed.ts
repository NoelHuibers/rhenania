// tenant-seed.ts — default rows every tenant DB starts with.
//
// Used by `tenant-provisioning.ts` for new tenants and by the local dev /
// test setup. Idempotent: every insert ignores rows that already exist.

import type { LibSQLDatabase } from "drizzle-orm/libsql";

import * as tenantSchema from "~/server/db/schema";
import {
	DEFAULT_EVENT_TYPES,
	DEFAULT_HOMEPAGE_SECTIONS,
	DEFAULT_KASSE_TYPES,
	DEFAULT_MEMBER_STATUSES,
	DEFAULT_ROLES,
} from "~/server/lib/tenant-default-config";

export type TenantSeedDb = LibSQLDatabase<typeof tenantSchema>;

/** Adds the default roles that are missing; existing ones stay untouched. */
export async function seedDefaultRoles(tdb: TenantSeedDb): Promise<void> {
	await tdb
		.insert(tenantSchema.roles)
		.values(DEFAULT_ROLES)
		.onConflictDoNothing({ target: tenantSchema.roles.name });
}

export async function seedTenantDefaults(tdb: TenantSeedDb): Promise<void> {
	await seedDefaultRoles(tdb);

	await tdb
		.insert(tenantSchema.kasseConfig)
		.values({ id: "singleton", pfandWert: 0 })
		.onConflictDoNothing({ target: tenantSchema.kasseConfig.id });

	await tdb
		.insert(tenantSchema.semesterConfig)
		.values({ id: "singleton", name: "" })
		.onConflictDoNothing({ target: tenantSchema.semesterConfig.id });

	for (const k of DEFAULT_KASSE_TYPES) {
		await tdb
			.insert(tenantSchema.kasseTypes)
			.values(k)
			.onConflictDoNothing({ target: tenantSchema.kasseTypes.key });
	}

	for (const e of DEFAULT_EVENT_TYPES) {
		await tdb
			.insert(tenantSchema.eventTypes)
			.values(e)
			.onConflictDoNothing({ target: tenantSchema.eventTypes.key });
	}

	for (const s of DEFAULT_HOMEPAGE_SECTIONS) {
		await tdb
			.insert(tenantSchema.homepageSections)
			.values(s)
			.onConflictDoNothing({ target: tenantSchema.homepageSections.key });
	}

	for (const m of DEFAULT_MEMBER_STATUSES) {
		await tdb
			.insert(tenantSchema.memberStatuses)
			.values(m)
			.onConflictDoNothing({ target: tenantSchema.memberStatuses.key });
	}
}
