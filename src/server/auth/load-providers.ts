// load-providers.ts — the Better Auth settings of one tenant: its hosts, its
// trusted origins and its Microsoft provider.
//
// Derived per request from the cached tenant config (`tenant-config.ts`), so
// a new Corps, a new domain or a rotated Azure secret takes effect as soon as
// the config cache sees the change (within TENANT_CONFIG_REVALIDATE_MS on
// other instances), without a redeploy. `auth/index.ts` builds one Better
// Auth instance per tenant from these settings.

import { isLocalHost } from "~/server/lib/local-host";
import type { TenantConfig } from "~/server/lib/tenant-config";

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

export type TenantAuthSettings = {
	tenantId: string;
	tenantSlug: string;
	/** Hosts Better Auth derives its base URL from (no port). */
	allowedHosts: string[];
	/** Origins allowed for CSRF checks and callback URLs. */
	trustedOrigins: string[];
	/** Base URL when a call carries no host: the primary domain. */
	fallbackOrigin: string | null;
	/** The tenant's Microsoft login, or null when not fully configured. */
	provider: TenantOAuthProvider | null;
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
	if (isLocalHost(hostname)) {
		return `http://${hostname}:3000`;
	}
	return `https://${hostname}`;
}

/** The Microsoft provider a tenant's config registers, if any. */
export function microsoftProviderFor(
	config: Pick<TenantConfig, "slug" | "microsoftLogin">,
): TenantOAuthProvider | null {
	const login = config.microsoftLogin;
	if (!login) {
		return null;
	}
	// No static redirectURI: Better Auth's dynamic baseURL derives it from
	// the request host, so the provider works on every domain of the tenant.
	return {
		providerId: microsoftProviderIdForSlug(config.slug),
		tenantSlug: config.slug,
		clientId: login.clientId,
		clientSecret: login.clientSecret,
		azureTenantId: login.azureTenantId,
		authorizationUrl: `https://login.microsoftonline.com/${login.azureTenantId}/oauth2/v2.0/authorize`,
		tokenUrl: `https://login.microsoftonline.com/${login.azureTenantId}/oauth2/v2.0/token`,
		userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
		scopes: DEFAULT_SCOPES,
	};
}

export function tenantAuthSettings(
	config: Pick<TenantConfig, "id" | "slug" | "hostnames" | "microsoftLogin">,
): TenantAuthSettings {
	const primary = config.hostnames[0];
	return {
		tenantId: config.id,
		tenantSlug: config.slug,
		allowedHosts: [...config.hostnames],
		trustedOrigins: config.hostnames.map(originForHostname),
		fallbackOrigin: primary ? originForHostname(primary) : null,
		provider: microsoftProviderFor(config),
	};
}
