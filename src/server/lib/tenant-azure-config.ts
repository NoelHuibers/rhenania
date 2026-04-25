// tenant-azure-config.ts — fetch the resolved tenant's Azure OAuth config.
//
// Used by Microsoft Graph token refresh to look up which Azure clientId /
// clientSecret / tenantId to use for the current request's tenant.

import { eq } from "drizzle-orm";
import { microsoftProviderIdForSlug } from "~/server/auth/load-providers";
import { controlDb } from "~/server/db/control";
import { tenantAuthConfig, tenants } from "~/server/db/control-schema";
import { requireTenantId } from "~/server/lib/tenant-context";

export type ResolvedTenantAzureConfig = {
	tenantId: string;
	tenantSlug: string;
	microsoftProviderId: string;
	azureClientId: string;
	azureClientSecret: string;
	azureTenantId: string;
};

export async function getCurrentTenantAzureConfig(): Promise<ResolvedTenantAzureConfig | null> {
	const tenantId = await requireTenantId();

	const [row] = await controlDb
		.select({
			tenantId: tenants.id,
			slug: tenants.slug,
			microsoftEnabled: tenantAuthConfig.microsoftEnabled,
			azureClientId: tenantAuthConfig.azureClientId,
			azureClientSecret: tenantAuthConfig.azureClientSecret,
			azureTenantId: tenantAuthConfig.azureTenantId,
		})
		.from(tenants)
		.leftJoin(tenantAuthConfig, eq(tenantAuthConfig.tenantId, tenants.id))
		.where(eq(tenants.id, tenantId))
		.limit(1);

	if (
		!row ||
		!row.microsoftEnabled ||
		!row.azureClientId ||
		!row.azureClientSecret ||
		!row.azureTenantId
	) {
		return null;
	}

	return {
		tenantId: row.tenantId,
		tenantSlug: row.slug,
		microsoftProviderId: microsoftProviderIdForSlug(row.slug),
		azureClientId: row.azureClientId,
		azureClientSecret: row.azureClientSecret,
		azureTenantId: row.azureTenantId,
	};
}
