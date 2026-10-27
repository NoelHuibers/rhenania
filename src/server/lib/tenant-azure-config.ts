// tenant-azure-config.ts — the resolved tenant's Azure OAuth config.
//
// Used by Microsoft Graph token refresh to look up which Azure clientId /
// clientSecret / tenantId to use for the current request's tenant. Read
// through the tenant-config cache, like the Better Auth instance that
// registered the provider, so both see a rotated secret at the same time.

import { microsoftProviderIdForSlug } from "~/server/auth/load-providers";
import { getTenantConfig } from "~/server/lib/tenant-config";
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
	const config = await getTenantConfig(tenantId);
	const login = config?.microsoftLogin;
	if (!config || !login) {
		return null;
	}

	return {
		tenantId: config.id,
		tenantSlug: config.slug,
		microsoftProviderId: microsoftProviderIdForSlug(config.slug),
		azureClientId: login.clientId,
		azureClientSecret: login.clientSecret,
		azureTenantId: login.azureTenantId,
	};
}
