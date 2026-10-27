import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { tenantAuthConfig } from "~/server/db/control-schema";
import {
	microsoftConfig,
	setAuthConfig,
} from "../../../test/factories/platform";
import {
	controlDb,
	createTenant,
	setupTestDatabases,
	switchTenant,
} from "../../../test/harness";
import { getCurrentTenantAzureConfig } from "./tenant-azure-config";
import { commitTenantConfigChange } from "./tenant-config";
import { clearTenantCache } from "./tenant-context";

setupTestDatabases();

describe("getCurrentTenantAzureConfig", () => {
	test("returns the current tenant's Azure app and provider id", async () => {
		const hassia = await createTenant({ slug: "hassia" });
		const rhenania = await createTenant({ slug: "rhenania" });
		await setAuthConfig(hassia.id, microsoftConfig(1));
		await setAuthConfig(rhenania.id, microsoftConfig(2));

		switchTenant(rhenania);

		expect(await getCurrentTenantAzureConfig()).toEqual({
			tenantId: rhenania.id,
			tenantSlug: "rhenania",
			microsoftProviderId: "microsoft-rhenania",
			azureClientId: "client-2",
			azureClientSecret: "secret-2",
			azureTenantId: "azure-tenant-2",
		});
	});

	test("is null unless Microsoft is enabled and fully configured", async () => {
		const tenant = await createTenant();
		expect(await getCurrentTenantAzureConfig()).toBeNull();

		await setAuthConfig(tenant.id, {
			...microsoftConfig(),
			azureTenantId: null,
		});
		clearTenantCache(tenant.id);
		expect(await getCurrentTenantAzureConfig()).toBeNull();

		await setAuthConfig(tenant.id, {
			...microsoftConfig(),
			microsoftEnabled: false,
		});
		clearTenantCache(tenant.id);
		expect(await getCurrentTenantAzureConfig()).toBeNull();
	});

	test("sees a rotated secret through the tenant-config cache", async () => {
		const tenant = await createTenant();
		await setAuthConfig(tenant.id, microsoftConfig(1));
		expect((await getCurrentTenantAzureConfig())?.azureClientSecret).toBe(
			"secret-1",
		);

		await commitTenantConfigChange(tenant.id, [
			controlDb()
				.update(tenantAuthConfig)
				.set({ azureClientSecret: "rotated" })
				.where(eq(tenantAuthConfig.tenantId, tenant.id)),
		]);

		expect((await getCurrentTenantAzureConfig())?.azureClientSecret).toBe(
			"rotated",
		);
	});

	test("requires a tenant in the request", async () => {
		await expect(getCurrentTenantAzureConfig()).rejects.toThrow(
			/No tenant in request/,
		);
	});
});
