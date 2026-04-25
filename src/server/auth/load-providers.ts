// load-providers.ts — load per-tenant OAuth configs from the control DB
// at app startup. Used to register the genericOAuth plugin in `auth/index.ts`.
//
// Adding a new tenant or changing a tenant's Azure config requires an app
// restart for the change to take effect — acceptable trade-off for the small
// number of Corps and infrequent rotations.

import { eq } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import {
	tenantAuthConfig,
	tenantDomains,
	tenants,
} from "~/server/db/control-schema";

export type TenantOAuthProvider = {
	providerId: string;
	tenantSlug: string;
	clientId: string;
	clientSecret: string;
	azureTenantId: string;
	authorizationUrl: string;
	tokenUrl: string;
	userInfoUrl: string;
	scopes: string[];
};

export type LoadedProviders = {
	providers: TenantOAuthProvider[];
	trustedOrigins: string[];
	allowedHosts: string[];
};

const DEFAULT_SCOPES = [
	"openid",
	"profile",
	"email",
	"offline_access",
	"User.Read",
];

export function microsoftProviderIdForSlug(slug: string): string {
	return `microsoft-${slug}`;
}

function originForHostname(hostname: string): string {
	if (
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname.startsWith("127.")
	) {
		return `http://${hostname}:3000`;
	}
	return `https://${hostname}`;
}

export async function loadTenantOAuthProviders(): Promise<LoadedProviders> {
	const rows = await controlDb
		.select({
			tenantId: tenants.id,
			slug: tenants.slug,
			status: tenants.status,
			microsoftEnabled: tenantAuthConfig.microsoftEnabled,
			azureClientId: tenantAuthConfig.azureClientId,
			azureClientSecret: tenantAuthConfig.azureClientSecret,
			azureTenantId: tenantAuthConfig.azureTenantId,
			hostname: tenantDomains.hostname,
			isPrimary: tenantDomains.isPrimary,
		})
		.from(tenants)
		.leftJoin(tenantAuthConfig, eq(tenantAuthConfig.tenantId, tenants.id))
		.leftJoin(tenantDomains, eq(tenantDomains.tenantId, tenants.id));

	// Group by tenant; pick a primary domain per tenant for redirect URI.
	type TenantBundle = {
		slug: string;
		status: string;
		microsoftEnabled: boolean;
		azureClientId: string | null;
		azureClientSecret: string | null;
		azureTenantId: string | null;
		hostnames: { hostname: string; isPrimary: boolean }[];
	};
	const byTenant = new Map<string, TenantBundle>();

	for (const r of rows) {
		const existing = byTenant.get(r.tenantId);
		if (existing) {
			if (r.hostname) {
				existing.hostnames.push({
					hostname: r.hostname,
					isPrimary: r.isPrimary ?? false,
				});
			}
			continue;
		}
		byTenant.set(r.tenantId, {
			slug: r.slug,
			status: r.status,
			microsoftEnabled: Boolean(r.microsoftEnabled),
			azureClientId: r.azureClientId,
			azureClientSecret: r.azureClientSecret,
			azureTenantId: r.azureTenantId,
			hostnames: r.hostname
				? [{ hostname: r.hostname, isPrimary: r.isPrimary ?? false }]
				: [],
		});
	}

	const providers: TenantOAuthProvider[] = [];
	const trustedOrigins = new Set<string>();
	const allowedHosts = new Set<string>();

	for (const t of byTenant.values()) {
		if (t.status === "suspended") continue;

		for (const h of t.hostnames) {
			trustedOrigins.add(originForHostname(h.hostname));
			allowedHosts.add(h.hostname);
		}

		if (
			!t.microsoftEnabled ||
			!t.azureClientId ||
			!t.azureClientSecret ||
			!t.azureTenantId
		) {
			continue;
		}

		// No static redirectURI — Better Auth's dynamic baseURL config (set in
		// `auth/index.ts` via `baseURL: { allowedHosts }`) derives the redirect
		// from the request host per call, so the same provider works from
		// rhenania-stuttgart.de, www.rhenania-stuttgart.de, and localhost.
		const providerId = microsoftProviderIdForSlug(t.slug);
		providers.push({
			providerId,
			tenantSlug: t.slug,
			clientId: t.azureClientId,
			clientSecret: t.azureClientSecret,
			azureTenantId: t.azureTenantId,
			authorizationUrl: `https://login.microsoftonline.com/${t.azureTenantId}/oauth2/v2.0/authorize`,
			tokenUrl: `https://login.microsoftonline.com/${t.azureTenantId}/oauth2/v2.0/token`,
			userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
			scopes: DEFAULT_SCOPES,
		});
	}

	return {
		providers,
		trustedOrigins: Array.from(trustedOrigins),
		allowedHosts: Array.from(allowedHosts),
	};
}
