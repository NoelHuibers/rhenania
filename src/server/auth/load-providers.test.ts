import { describe, expect, test } from "vitest";

import { tenantDomains } from "~/server/db/control-schema";
import { getTenantConfig } from "~/server/lib/tenant-config";
import {
	addDomain,
	microsoftConfig,
	setAuthConfig,
} from "../../../test/factories/platform";
import {
	controlDb,
	createTenant,
	setupTestDatabases,
} from "../../../test/harness";
import {
	microsoftProviderIdForSlug,
	type TenantAuthSettings,
	tenantAuthSettings,
} from "./load-providers";

setupTestDatabases();

async function settingsOf(tenantId: string): Promise<TenantAuthSettings> {
	const config = await getTenantConfig(tenantId);
	if (!config) {
		throw new Error("no tenant");
	}
	return tenantAuthSettings(config);
}

describe("tenantAuthSettings", () => {
	test("registers the tenant's own Microsoft provider", async () => {
		const tenant = await createTenant({ slug: "hassia" });
		await setAuthConfig(tenant.id, {
			microsoftEnabled: true,
			azureClientId: "client-id",
			azureClientSecret: "client-secret",
			azureTenantId: "azure-tenant",
		});

		expect(await settingsOf(tenant.id)).toEqual({
			tenantId: tenant.id,
			tenantSlug: "hassia",
			allowedHosts: ["hassia.test.localhost"],
			trustedOrigins: ["http://hassia.test.localhost:3000"],
			fallbackOrigin: "http://hassia.test.localhost:3000",
			provider: {
				providerId: "microsoft-hassia",
				tenantSlug: "hassia",
				clientId: "client-id",
				clientSecret: "client-secret",
				azureTenantId: "azure-tenant",
				authorizationUrl:
					"https://login.microsoftonline.com/azure-tenant/oauth2/v2.0/authorize",
				tokenUrl:
					"https://login.microsoftonline.com/azure-tenant/oauth2/v2.0/token",
				userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
				scopes: ["openid", "profile", "email", "offline_access", "User.Read"],
			},
		});
	});

	test("has no provider for disabled or incomplete configs but keeps the hosts", async () => {
		const disabled = await createTenant({ slug: "disabled" });
		await setAuthConfig(disabled.id, {
			...microsoftConfig(),
			microsoftEnabled: false,
		});
		const noSecret = await createTenant({ slug: "nosecret" });
		await setAuthConfig(noSecret.id, {
			...microsoftConfig(),
			azureClientSecret: null,
		});
		const noConfig = await createTenant({ slug: "noconfig" });

		for (const [tenant, host] of [
			[disabled, "disabled.test.localhost"],
			[noSecret, "nosecret.test.localhost"],
			[noConfig, "noconfig.test.localhost"],
		] as const) {
			const settings = await settingsOf(tenant.id);
			expect(settings.provider).toBeNull();
			expect(settings.allowedHosts).toEqual([host]);
		}
	});

	test("derives origins from every domain, http for local; primary first", async () => {
		const tenant = await createTenant({ slug: "rhenania" });
		await addDomain(tenant.id, "www.rhenania-stuttgart.de");
		await addDomain(tenant.id, "localhost");
		await addDomain(tenant.id, "127.0.0.1");
		await controlDb().update(tenantDomains).set({ isPrimary: false });
		await addDomain(tenant.id, "rhenania-stuttgart.de", true);

		const settings = await settingsOf(tenant.id);

		expect(settings.allowedHosts).toEqual([
			"rhenania-stuttgart.de",
			"127.0.0.1",
			"localhost",
			"rhenania.test.localhost",
			"www.rhenania-stuttgart.de",
		]);
		expect(settings.trustedOrigins).toEqual([
			"https://rhenania-stuttgart.de",
			"http://127.0.0.1:3000",
			"http://localhost:3000",
			"http://rhenania.test.localhost:3000",
			"https://www.rhenania-stuttgart.de",
		]);
		expect(settings.fallbackOrigin).toBe("https://rhenania-stuttgart.de");
	});

	test("a tenant without any domain gets no hosts and no fallback", async () => {
		const tenant = await createTenant({ slug: "nodomain" });
		await setAuthConfig(tenant.id, microsoftConfig());
		await controlDb().delete(tenantDomains);

		const settings = await settingsOf(tenant.id);

		expect(settings.provider?.providerId).toBe("microsoft-nodomain");
		expect(settings.allowedHosts).toEqual([]);
		expect(settings.trustedOrigins).toEqual([]);
		expect(settings.fallbackOrigin).toBeNull();
	});
});

test("provider ids are namespaced per tenant slug", () => {
	expect(microsoftProviderIdForSlug("hassia")).toBe("microsoft-hassia");
});
