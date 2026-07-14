// tenant-provisioning.ts — orchestrate creating a new tenant.
//
// Flow:
//   1. Validate the slug.
//   2. Call Turso Platform API to create a fresh libSQL DB in the `corps` group.
//   3. Mint a long-lived auth token for it.
//   4. Connect, run all drizzle migrations from `./drizzle`.
//   5. Seed defaults: roles, kasseConfig, semesterConfig.
//   6. Insert `tenants` + `tenantAuthConfig` rows in the control DB.
//
// On any failure after the Turso DB is created, we try to delete it so we
// don't leak orphaned databases. If that delete fails, the error message
// includes the DB name so the operator can clean up by hand.

import path from "node:path";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { controlDb } from "~/server/db/control";
import { tenantAuthConfig, tenants } from "~/server/db/control-schema";
import * as tenantSchema from "~/server/db/schema";
import {
	DEFAULT_EVENT_TYPES,
	DEFAULT_HOMEPAGE_SECTIONS,
	DEFAULT_KASSE_TYPES,
	DEFAULT_MEMBER_STATUSES,
} from "~/server/lib/tenant-default-config";
import {
	createDatabase,
	createDatabaseToken,
	deleteDatabase,
	tursoDatabaseNameForSlug,
} from "~/server/lib/turso-platform";

// Same defaults as `initializeRoles` in admin.ts. Kept in sync manually for now;
// when default-role configuration becomes per-tenant we'll move this to a
// per-tenant config table.
const DEFAULT_ROLES: Array<{ name: string; description: string }> = [
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

function validateSlug(slug: string): void {
	if (!/^[a-z][a-z0-9-]{2,30}$/.test(slug)) {
		throw new Error(
			"Slug must be 3-31 chars, lowercase letters/digits/dashes, starting with a letter.",
		);
	}
}

export type ProvisionTenantInput = {
	slug: string;
	displayName: string;
};

export type ProvisionTenantResult = {
	tenantId: string;
	dbName: string;
	dbUrl: string;
};

export async function provisionTenant(
	input: ProvisionTenantInput,
): Promise<ProvisionTenantResult> {
	const slug = input.slug.trim().toLowerCase();
	const displayName = input.displayName.trim();
	validateSlug(slug);
	if (!displayName) throw new Error("displayName is required.");

	const [existing] = await controlDb
		.select({ id: tenants.id })
		.from(tenants)
		.where(eq(tenants.slug, slug))
		.limit(1);
	if (existing) {
		throw new Error(`Tenant '${slug}' already exists in the control DB.`);
	}

	const dbName = tursoDatabaseNameForSlug(slug);

	// Step 1: provision Turso DB. Past this point we own a real resource and
	// must clean up on failure.
	const created = await createDatabase(dbName);

	let token: string | undefined;
	try {
		token = await createDatabaseToken(dbName);

		// Step 2: connect + run migrations.
		const tenantClient = createClient({ url: created.url, authToken: token });
		const tenantDb = drizzle(tenantClient, { schema: tenantSchema });
		try {
			await migrate(tenantDb, {
				migrationsFolder: path.join(process.cwd(), "drizzle"),
			});

			// Step 3: seed defaults.
			await seedTenantDefaults(tenantDb);
		} finally {
			tenantClient.close();
		}

		// Step 4: write the control-plane rows.
		const [insertedTenant] = await controlDb
			.insert(tenants)
			.values({
				slug,
				displayName,
				status: "active",
				dbUrl: created.url,
				dbAuthToken: token,
			})
			.returning({ id: tenants.id });

		if (!insertedTenant) throw new Error("Failed to insert tenant row.");

		await controlDb.insert(tenantAuthConfig).values({
			tenantId: insertedTenant.id,
			emailPasswordEnabled: true,
			microsoftEnabled: false,
		});

		return {
			tenantId: insertedTenant.id,
			dbName,
			dbUrl: created.url,
		};
	} catch (err) {
		// Roll back: delete the Turso DB we just created.
		try {
			await deleteDatabase(dbName);
		} catch (rollbackErr) {
			const provisionMsg = err instanceof Error ? err.message : String(err);
			const rollbackMsg =
				rollbackErr instanceof Error
					? rollbackErr.message
					: String(rollbackErr);
			throw new Error(
				`Tenant provisioning failed AND rollback failed. Manual cleanup required for Turso DB '${dbName}'. ` +
					`Original: ${provisionMsg} | Rollback: ${rollbackMsg}`,
			);
		}
		throw err;
	}
}

async function seedTenantDefaults(
	tdb: ReturnType<typeof drizzle<typeof tenantSchema>>,
): Promise<void> {
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
