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
} from "~/server/lib/tenant-default-config";

export type TenantSeedDb = LibSQLDatabase<typeof tenantSchema>;

// Same defaults as `initializeRoles` in admin.ts. Kept in sync manually for now;
// when default-role configuration becomes per-tenant we'll move this to a
// per-tenant config table.
export const DEFAULT_ROLES: Array<{ name: string; description: string }> = [
	{ name: "Admin", description: "Systemadministration" },
	{ name: "Getränkewart", description: "Getränkeversorgung" },
	{ name: "Fuchs", description: "Fuchsenladen Management" },
	{ name: "Fotowart", description: "Fotos der Website verwalten" },
	{ name: "Faxe", description: "Faxe, Hausmeister, Putzfirma" },
	{ name: "Hausbewohner", description: "Aktive" },
	{ name: "Senior", description: "Senior des Corps (x)" },
	{ name: "Consenior", description: "Consenior des Corps (xx)" },
	{ name: "Subsenior", description: "Subsenior des Corps (xxx)" },
	{ name: "Fuchsmajor", description: "Fuchsmajor des Corps (FM)" },
	{ name: "CC-Kasse", description: "CC-Kassenwart" },
	{ name: "Aktivenkasse", description: "Aktivenkassenwart" },
];

export async function seedTenantDefaults(tdb: TenantSeedDb): Promise<void> {
	for (const role of DEFAULT_ROLES) {
		await tdb
			.insert(tenantSchema.roles)
			.values(role)
			.onConflictDoNothing({ target: tenantSchema.roles.name });
	}

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
