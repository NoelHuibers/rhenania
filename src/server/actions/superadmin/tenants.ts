"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { controlDb } from "~/server/db/control";
import {
	tenantAuthConfig,
	tenantDomains,
	tenantMemberships,
	tenants,
} from "~/server/db/control-schema";
import { requireSuperAdmin } from "~/server/lib/super-admin";
import { provisionTenant } from "~/server/lib/tenant-provisioning";

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

		const tenantRows = await controlDb
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
			.leftJoin(tenantAuthConfig, eq(tenantAuthConfig.tenantId, tenants.id));

		const result: SuperadminTenantRow[] = [];
		for (const t of tenantRows) {
			const domains = await controlDb
				.select({ id: tenantDomains.id })
				.from(tenantDomains)
				.where(eq(tenantDomains.tenantId, t.id));
			const members = await controlDb
				.select({ userId: tenantMemberships.userId })
				.from(tenantMemberships)
				.where(eq(tenantMemberships.tenantId, t.id));
			result.push({
				id: t.id,
				slug: t.slug,
				displayName: t.displayName,
				status: t.status,
				dbUrl: t.dbUrl,
				createdAt: t.createdAt,
				domainCount: domains.length,
				memberCount: members.length,
				microsoftEnabled: Boolean(t.microsoftEnabled),
			});
		}

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

export async function createTenantAction(input: {
	slug: string;
	displayName: string;
}): Promise<ActionResult<{ tenantId: string; dbUrl: string }>> {
	try {
		await requireSuperAdmin();

		const result = await provisionTenant({
			slug: input.slug,
			displayName: input.displayName,
		});

		revalidatePath("/superadmin");
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
	} | null;
	memberCount: number;
};

export async function getTenantDetailAction(
	tenantId: string,
): Promise<ActionResult<SuperadminTenantDetail>> {
	try {
		await requireSuperAdmin();

		const [t] = await controlDb
			.select()
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1);
		if (!t) return { success: false, error: "Tenant not found" };

		const domains = await controlDb
			.select()
			.from(tenantDomains)
			.where(eq(tenantDomains.tenantId, tenantId));

		const [cfg] = await controlDb
			.select()
			.from(tenantAuthConfig)
			.where(eq(tenantAuthConfig.tenantId, tenantId))
			.limit(1);

		const memberRows = await controlDb
			.select({ userId: tenantMemberships.userId })
			.from(tenantMemberships)
			.where(eq(tenantMemberships.tenantId, tenantId));

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
						}
					: null,
				memberCount: memberRows.length,
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

// ─── Status ───────────────────────────────────────────────────────────────────

export async function setTenantStatusAction(
	tenantId: string,
	status: "active" | "suspended",
): Promise<ActionResult> {
	try {
		await requireSuperAdmin();
		await controlDb
			.update(tenants)
			.set({ status })
			.where(eq(tenants.id, tenantId));
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
		if (!trimmed) return { success: false, error: "Display name is required" };
		await controlDb
			.update(tenants)
			.set({ displayName: trimmed })
			.where(eq(tenants.id, tenantId));
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
		if (!host) return { success: false, error: "Hostname is required" };
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

		await controlDb.insert(tenantDomains).values({
			tenantId,
			hostname: host,
			isPrimary: opts.isPrimary ?? false,
			isCustom: opts.isCustom ?? !host.endsWith("localhost"),
			verifiedAt: new Date(),
		});

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
		await controlDb
			.delete(tenantDomains)
			.where(
				and(
					eq(tenantDomains.id, domainId),
					eq(tenantDomains.tenantId, tenantId),
				),
			);
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

		if (existing) {
			if (Object.keys(set).length > 0) {
				await controlDb
					.update(tenantAuthConfig)
					.set(set)
					.where(eq(tenantAuthConfig.tenantId, tenantId));
			}
		} else {
			await controlDb.insert(tenantAuthConfig).values({
				tenantId,
				emailPasswordEnabled: true,
				microsoftEnabled: Boolean(patch.microsoftEnabled),
				azureClientId: patch.azureClientId ?? null,
				azureClientSecret: patch.azureClientSecret ?? null,
				azureTenantId: patch.azureTenantId ?? null,
			});
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
