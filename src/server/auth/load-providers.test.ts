import { describe, expect, test } from "vitest";

import { tenantDomains } from "~/server/db/control-schema";
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
	loadTenantOAuthProviders,
	microsoftProviderIdForSlug,
} from "./load-providers";

setupTestDatabases();

describe("loadTenantOAuthProviders", () => {
	test("registers one Microsoft provider per fully configured tenant", async () => {
		const tenant = await createTenant({ slug: "hassia" });
		await setAuthConfig(tenant.id, {
			microsoftEnabled: true,
			azureClientId: "client-id",
			azureClientSecret: "client-secret",
			azureTenantId: "azure-tenant",
		});

		const { providers } = await loadTenantOAuthProviders();

		expect(providers).toEqual([
			{
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
		]);
	});

	test("skips Microsoft for disabled or incomplete configs but keeps their hosts", async () => {
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
		await createTenant({ slug: "noconfig" });

		const loaded = await loadTenantOAuthProviders();

		expect(loaded.providers).toEqual([]);
		expect(loaded.allowedHosts.sort()).toEqual([
			"disabled.test.localhost",
			"noconfig.test.localhost",
			"nosecret.test.localhost",
		]);
	});

	test("derives trusted origins from every domain: http for local, https otherwise", async () => {
		const tenant = await createTenant({ slug: "rhenania" });
		await addDomain(tenant.id, "rhenania-stuttgart.de");
		await addDomain(tenant.id, "www.rhenania-stuttgart.de");
		await addDomain(tenant.id, "localhost");
		await addDomain(tenant.id, "127.0.0.1");
		await setAuthConfig(tenant.id, microsoftConfig());

		const loaded = await loadTenantOAuthProviders();

		expect(loaded.providers).toHaveLength(1);
		expect(loaded.trustedOrigins.sort()).toEqual([
			"http://127.0.0.1:3000",
			"http://localhost:3000",
			"http://rhenania.test.localhost:3000",
			"https://rhenania-stuttgart.de",
			"https://www.rhenania-stuttgart.de",
		]);
		expect(loaded.allowedHosts).toHaveLength(5);
	});

	test("leaves suspended tenants out entirely", async () => {
		const tenant = await createTenant({ slug: "gone", status: "suspended" });
		await setAuthConfig(tenant.id, microsoftConfig());

		expect(await loadTenantOAuthProviders()).toEqual({
			providers: [],
			trustedOrigins: [],
			allowedHosts: [],
		});
	});

	test("includes tenants without any domain as providers only", async () => {
		const tenant = await createTenant({ slug: "nodomain" });
		await setAuthConfig(tenant.id, microsoftConfig());
		await controlDb().delete(tenantDomains);

		const loaded = await loadTenantOAuthProviders();

		expect(loaded.providers.map((p) => p.providerId)).toEqual([
			"microsoft-nodomain",
		]);
		expect(loaded.trustedOrigins).toEqual([]);
	});
});

test("provider ids are namespaced per tenant slug", () => {
	expect(microsoftProviderIdForSlug("hassia")).toBe("microsoft-hassia");
});
