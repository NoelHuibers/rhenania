"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
	type FeatureFlags,
	isFeatureKey,
	resolveFeatureFlags,
} from "~/lib/features";
import { controlDb } from "~/server/db/control";
import {
	tenantAuthConfig,
	tenantDomains,
	tenantFeatures,
	tenantMemberships,
	tenants,
} from "~/server/db/control-schema";
import { requireSuperAdmin } from "~/server/lib/super-admin";
import { commitTenantConfigChange } from "~/server/lib/tenant-config";
import {
	abandonTenantProvisioning,
	listUnfinishedProvisionings,
	provisionTenant,
	type UnfinishedProvisioning,
} from "~/server/lib/tenant-provisioning";

type ActionResult<T = void> = {
	success: boolean;
	error?: string;
	data?: T;
};

// ─── List ─────────────────────────────────────────────────────────────────────

export type SuperadminTenantRow = {
	id: string;
	slug: string;
	displayName: string;
	status: "active" | "suspended" | "pending";
	dbUrl: string;
	createdAt: Date;
	domainCount: number;
	memberCount: number;
	microsoftEnabled: boolean;
};

export async function listTenantsAction(): Promise<
	ActionResult<SuperadminTenantRow[]>
> {
	try {
		await requireSuperAdmin();

		// Three queries in one round trip, however many tenants there are.
		const [tenantRows, domainCounts, memberCounts] = await controlDb.batch([
			controlDb
				.select({
					id: tenants.id,
					slug: tenants.slug,
					displayName: tenants.displayName,
					status: tenants.status,
					dbUrl: tenants.dbUrl,
					createdAt: tenants.createdAt,
					microsoftEnabled: tenantAuthConfig.microsoftEnabled,
				})
				.from(tenants)
				.leftJoin(tenantAuthConfig, eq(tenantAuthConfig.tenantId, tenants.id)),
			controlDb
				.select({ tenantId: tenantDomains.tenantId, n: count() })
				.from(tenantDomains)
				.groupBy(tenantDomains.tenantId),
			controlDb
				.select({ tenantId: tenantMemberships.tenantId, n: count() })
				.from(tenantMemberships)
				.groupBy(tenantMemberships.tenantId),
		]);
		const domainsByTenant = new Map(domainCounts.map((r) => [r.tenantId, r.n]));
		const membersByTenant = new Map(memberCounts.map((r) => [r.tenantId, r.n]));

		const result: SuperadminTenantRow[] = tenantRows.map((t) => ({
			id: t.id,
			slug: t.slug,
			displayName: t.displayName,
			status: t.status,
			dbUrl: t.dbUrl,
			createdAt: t.createdAt,
			domainCount: domainsByTenant.get(t.id) ?? 0,
			memberCount: membersByTenant.get(t.id) ?? 0,
			microsoftEnabled: Boolean(t.microsoftEnabled),
		}));

		return { success: true, data: result };
	} catch (e) {
		console.error("listTenantsAction failed:", e);
		return {
			success: false,
			error: e instanceof Error ? e.message : "Unknown error",
		};
	}
}

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Creates a tenant, or resumes the unfinished provisioning run for the same
 * slug (see tenant-provisioning.ts).
 */
export async function createTenantAction(input: {
	slug: string;
	displayName: string;
	primaryHostname?: string | null;
	firstAdminEmail?: string | null;
}): Promise<ActionResult<{ tenantId: string; dbUrl: string }>> {
	try {
		await requireSuperAdmin();
	} catch (e) {
		return {
			success: false,
			error: e instanceof Error ? e.message : "Unknown error",
		};
	}
	try {
		const result = await provisionTenant({
			slug: input.slug,
			displayName: input.displayName,
			primaryHostname: input.primaryHostname,
			firstAdminEmail: input.firstAdminEmail,
		});
		return {
			success: true,
			data: { tenantId: result.tenantId, dbUrl: result.dbUrl },
		};
	} catch (e) {
		console.error("createTenantAction failed:", e);
		return {
			success: false,
			error: e instanceof Error ? e.message : "Unknown error",
		};
	} finally {
		// A failed run shows up as unfinished (and maybe a pending tenant).
		revalidatePath("/superadmin");
	}
}

export async function listTenantProvisioningsAction(): Promise<
	ActionResult<UnfinishedProvisioning[]>
> {
	try {
		await requireSuperAdmin();
		return { success: true, data: await listUnfinishedProvisionings() };
	} catch (e) {
		console.error("listTenantProvisioningsAction failed:", e);
		return {
			success: false,
			error: e instanceof Error ? e.message : "Unknown error",
		};
	}
}

/** Deletes an unfinished run's Turso DB and control rows. */
export async function abandonTenantProvisioningAction(
	slug: string,
): Promise<ActionResult> {
	try {
		await requireSuperAdmin();
		await abandonTenantProvisioning(slug);
		revalidatePath("/superadmin");
		return { success: true };
	} catch (e) {
		console.error("abandonTenantProvisioningAction failed:", e);
		return {
			success: false,
			error: e instanceof Error ? e.message : "Unknown error",
		};
	}
}

// ─── Detail ───────────────────────────────────────────────────────────────────

export type SuperadminTenantDetail = {
	tenant: {
		id: string;
		slug: string;
		displayName: string;
		status: "active" | "suspended" | "pending";
		dbUrl: string;
		createdAt: Date;
	};
	domains: Array<{
		id: string;
		hostname: string;
		isPrimary: boolean;
		isCustom: boolean;
		verifiedAt: Date | null;
	}>;
	authConfig: {
		emailPasswordEnabled: boolean;
		microsoftEnabled: boolean;
		azureClientId: string | null;
		azureTenantId: string | null;
		hasAzureSecret: boolean;
		mailSenderEmail: string | null;
	} | null;
	memberCount: number;
	features: FeatureFlags;
};

export async function getTenantDetailAction(
	tenantId: string,
): Promise<ActionResult<SuperadminTenantDetail>> {
	try {
		await requireSuperAdmin();

		const [[t], domains, [cfg], [members], featureRows] = await controlDb.batch(
			[
				controlDb
					.select()
					.from(tenants)
					.where(eq(tenants.id, tenantId))
					.limit(1),
				controlDb
					.select()
					.from(tenantDomains)
					.where(eq(tenantDomains.tenantId, tenantId)),
				controlDb
					.select()
					.from(tenantAuthConfig)
					.where(eq(tenantAuthConfig.tenantId, tenantId))
					.limit(1),
				controlDb
					.select({ n: count() })
					.from(tenantMemberships)
					.where(eq(tenantMemberships.tenantId, tenantId)),
				controlDb
					.select({ key: tenantFeatures.key, enabled: tenantFeatures.enabled })
					.from(tenantFeatures)
					.where(eq(tenantFeatures.tenantId, tenantId)),
			],
		);
		if (!t) {
			return { success: false, error: "Tenant not found" };
		}

		return {
			success: true,
			data: {
				tenant: {
					id: t.id,
					slug: t.slug,
					displayName: t.displayName,
					status: t.status,
					dbUrl: t.dbUrl,
					createdAt: t.createdAt,
				},
				domains: domains.map((d) => ({
					id: d.id,
					hostname: d.hostname,
					isPrimary: d.isPrimary,
					isCustom: d.isCustom,
					verifiedAt: d.verifiedAt ?? null,
				})),
				authConfig: cfg
					? {
							emailPasswordEnabled: cfg.emailPasswordEnabled,
							microsoftEnabled: cfg.microsoftEnabled,
							azureClientId: cfg.azureClientId,
							azureTenantId: cfg.azureTenantId,
							hasAzureSecret: Boolean(cfg.azureClientSecret),
							mailSenderEmail: cfg.mailSenderEmail,
						}
					: null,
				memberCount: members?.n ?? 0,
				features: resolveFeatureFlags(featureRows),
			},
		};
	} catch (e) {
		console.error("getTenantDetailAction failed:", e);
		return {
			success: false,
			error: e instanceof Error ? e.message : "Unknown error",
		};
	}
}

// ─── Feature flags ────────────────────────────────────────────────────────────

export async function setTenantFeatureAction(
	tenantId: string,
	key: string,
	enabled: boolean,
): Promise<ActionResult> {
	try {
		const { userId } = await requireSuperAdmin();
		if (!isFeatureKey(key)) {
			return { success: false, error: `Unknown feature: ${key}` };
		}

		const [tenant] = await controlDb
			.select({ id: tenants.id })
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1);
		if (!tenant) {
			return { success: false, error: "Tenant not found" };
		}

		// Other instances see the change within one config revalidation
		// interval (tenant-config.ts).
		await commitTenantConfigChange(tenantId, [
			controlDb
				.insert(tenantFeatures)
				.values({ tenantId, key, enabled, updatedBy: userId })
				.onConflictDoUpdate({
					target: [tenantFeatures.tenantId, tenantFeatures.key],
					set: { enabled, updatedBy: userId, updatedAt: new Date() },
				}),
		]);
		revalidatePath(`/superadmin/tenants/${tenantId}`);
		return { success: true };
	} catch (e) {
		console.error("setTenantFeatureAction failed:", e);
		return {
			success: false,
			error: e instanceof Error ? e.message : "Unknown error",
		};
	}
}

// ─── Status ───────────────────────────────────────────────────────────────────

export async function setTenantStatusAction(
	tenantId: string,
	status: "active" | "suspended",
): Promise<ActionResult> {
	try {
		await requireSuperAdmin();
		await commitTenantConfigChange(tenantId, [
			controlDb.update(tenants).set({ status }).where(eq(tenants.id, tenantId)),
		]);
		revalidatePath("/superadmin");
		revalidatePath(`/superadmin/tenants/${tenantId}`);
		return { success: true };
	} catch (e) {
		console.error("setTenantStatusAction failed:", e);
		return {
			success: false,
			error: e instanceof Error ? e.message : "Unknown error",
		};
	}
}

export async function updateTenantDisplayNameAction(
	tenantId: string,
	displayName: string,
): Promise<ActionResult> {
	try {
		await requireSuperAdmin();
		const trimmed = displayName.trim();
		if (!trimmed) {
			return { success: false, error: "Display name is required" };
		}
		await commitTenantConfigChange(tenantId, [
			controlDb
				.update(tenants)
				.set({ displayName: trimmed })
				.where(eq(tenants.id, tenantId)),
		]);
		revalidatePath(`/superadmin/tenants/${tenantId}`);
		return { success: true };
	} catch (e) {
		console.error("updateTenantDisplayNameAction failed:", e);
		return {
			success: false,
			error: e instanceof Error ? e.message : "Unknown error",
		};
	}
}

// ─── Domains ──────────────────────────────────────────────────────────────────

export async function addTenantDomainAction(
	tenantId: string,
	hostname: string,
	opts: { isPrimary?: boolean; isCustom?: boolean } = {},
): Promise<ActionResult> {
	try {
		await requireSuperAdmin();
		const host = hostname.trim().toLowerCase();
		if (!host) {
			return { success: false, error: "Hostname is required" };
		}
		if (!/^[a-z0-9.-]+$/.test(host)) {
			return { success: false, error: "Invalid hostname characters" };
		}

		const [conflict] = await controlDb
			.select({ tenantId: tenantDomains.tenantId })
			.from(tenantDomains)
			.where(eq(tenantDomains.hostname, host))
			.limit(1);
		if (conflict) {
			return {
				success: false,
				error:
					conflict.tenantId === tenantId
						? "Hostname already registered for this tenant"
						: "Hostname already registered to another tenant",
			};
		}

		await commitTenantConfigChange(tenantId, [
			controlDb.insert(tenantDomains).values({
				tenantId,
				hostname: host,
				isPrimary: opts.isPrimary ?? false,
				isCustom: opts.isCustom ?? !host.endsWith("localhost"),
				verifiedAt: new Date(),
			}),
		]);

		revalidatePath(`/superadmin/tenants/${tenantId}`);
		return { success: true };
	} catch (e) {
		console.error("addTenantDomainAction failed:", e);
		return {
			success: false,
			error: e instanceof Error ? e.message : "Unknown error",
		};
	}
}

export async function removeTenantDomainAction(
	tenantId: string,
	domainId: string,
): Promise<ActionResult> {
	try {
		await requireSuperAdmin();
		await commitTenantConfigChange(tenantId, [
			controlDb
				.delete(tenantDomains)
				.where(
					and(
						eq(tenantDomains.id, domainId),
						eq(tenantDomains.tenantId, tenantId),
					),
				),
		]);
		revalidatePath(`/superadmin/tenants/${tenantId}`);
		return { success: true };
	} catch (e) {
		console.error("removeTenantDomainAction failed:", e);
		return {
			success: false,
			error: e instanceof Error ? e.message : "Unknown error",
		};
	}
}

// ─── Auth config ──────────────────────────────────────────────────────────────

export type AuthConfigPatch = {
	microsoftEnabled?: boolean;
	azureClientId?: string | null;
	azureClientSecret?: string | null;
	azureTenantId?: string | null;
	mailSenderEmail?: string | null;
};

export async function updateTenantAuthConfigAction(
	tenantId: string,
	patch: AuthConfigPatch,
): Promise<ActionResult> {
	try {
		await requireSuperAdmin();

		const [existing] = await controlDb
			.select()
			.from(tenantAuthConfig)
			.where(eq(tenantAuthConfig.tenantId, tenantId))
			.limit(1);

		// Strict allowlist — never spread incoming object directly into .set()
		const set: Record<string, unknown> = {};
		if (patch.microsoftEnabled !== undefined) {
			set.microsoftEnabled = patch.microsoftEnabled;
		}
		if (patch.azureClientId !== undefined) {
			set.azureClientId = patch.azureClientId;
		}
		if (patch.azureClientSecret !== undefined) {
			set.azureClientSecret = patch.azureClientSecret;
		}
		if (patch.azureTenantId !== undefined) {
			set.azureTenantId = patch.azureTenantId;
		}
		if (patch.mailSenderEmail !== undefined) {
			set.mailSenderEmail = patch.mailSenderEmail;
		}

		if (existing) {
			if (Object.keys(set).length > 0) {
				await commitTenantConfigChange(tenantId, [
					controlDb
						.update(tenantAuthConfig)
						.set(set)
						.where(eq(tenantAuthConfig.tenantId, tenantId)),
				]);
			}
		} else {
			await commitTenantConfigChange(tenantId, [
				controlDb.insert(tenantAuthConfig).values({
					tenantId,
					emailPasswordEnabled: true,
					microsoftEnabled: Boolean(patch.microsoftEnabled),
					azureClientId: patch.azureClientId ?? null,
					azureClientSecret: patch.azureClientSecret ?? null,
					azureTenantId: patch.azureTenantId ?? null,
					mailSenderEmail: patch.mailSenderEmail ?? null,
				}),
			]);
		}

		revalidatePath(`/superadmin/tenants/${tenantId}`);
		return { success: true };
	} catch (e) {
		console.error("updateTenantAuthConfigAction failed:", e);
		return {
			success: false,
			error: e instanceof Error ? e.message : "Unknown error",
		};
	}
}
