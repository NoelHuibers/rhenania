import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { defaultFeatureFlags } from "~/lib/features";
import {
	tenantAuthConfig,
	tenantDomains,
	tenantFeatures,
	tenants,
} from "~/server/db/control-schema";
import {
	getTenantById,
	resolveTenantByHost,
} from "~/server/lib/tenant-context";
import {
	addDomain,
	grantSuperAdmin,
	microsoftConfig,
	setAuthConfig,
} from "../../../../test/factories/platform";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../../test/harness";
import {
	addTenantDomainAction,
	createTenantAction,
	getTenantDetailAction,
	listTenantsAction,
	removeTenantDomainAction,
	setTenantFeatureAction,
	setTenantStatusAction,
	updateTenantAuthConfigAction,
	updateTenantDisplayNameAction,
} from "./tenants";

// Provisioning talks to Turso; it has its own test file.
vi.mock("~/server/lib/tenant-provisioning", () => ({
	provisionTenant: vi.fn(),
}));

setupTestDatabases();

async function signInAsSuperAdmin() {
	const operator = await createUser({ name: "Operator" });
	await grantSuperAdmin(operator.id);
	signInAs(operator);
	return operator;
}

const domainsOf = (tenantId: string) =>
	controlDb()
		.select()
		.from(tenantDomains)
		.where(eq(tenantDomains.tenantId, tenantId));

describe("superadmin gate", () => {
	test("a tenant admin can neither read nor change tenants", async () => {
		const tenant = await createTenant({ displayName: "Corps A" });
		signInAs(await createUser({ roles: ["Admin"] }));
		vi.spyOn(console, "error").mockImplementation(() => {});

		const results = [
			await listTenantsAction(),
			await createTenantAction({ slug: "neu", displayName: "Neu" }),
			await getTenantDetailAction(tenant.id),
			await setTenantFeatureAction(tenant.id, "drinks.markup", true),
			await setTenantStatusAction(tenant.id, "suspended"),
			await updateTenantDisplayNameAction(tenant.id, "Hacked"),
			await addTenantDomainAction(tenant.id, "evil.example"),
			await removeTenantDomainAction(tenant.id, "any"),
			await updateTenantAuthConfigAction(tenant.id, { microsoftEnabled: true }),
		];

		for (const result of results) {
			expect(result).toEqual({ success: false, error: "Superadmin required" });
		}
		const [row] = await controlDb()
			.select()
			.from(tenants)
			.where(eq(tenants.id, tenant.id));
		expect(row).toMatchObject({ displayName: "Corps A", status: "active" });
		expect(await domainsOf(tenant.id)).toHaveLength(1);
		expect(await controlDb().select().from(tenantFeatures)).toHaveLength(0);
		expect(await controlDb().select().from(tenantAuthConfig)).toHaveLength(0);
	});

	test("anonymous callers are rejected", async () => {
		await createTenant();
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(await listTenantsAction()).toEqual({
			success: false,
			error: "Not authenticated",
		});
	});
});

describe("listTenantsAction", () => {
	test("lists every tenant with domain and member counts", async () => {
		const a = await createTenant({ slug: "alpha", displayName: "Alpha" });
		const b = await createTenant({ slug: "beta", status: "suspended" });
		await addDomain(a.id, "alpha.example");
		await createUser();
		await createUser({ tenantId: b.id });
		await setAuthConfig(a.id, microsoftConfig());
		await signInAsSuperAdmin(); // also a member of tenant A

		const result = await listTenantsAction();

		expect(result.success).toBe(true);
		const byId = new Map(result.data?.map((t) => [t.id, t]));
		expect(byId.get(a.id)).toMatchObject({
			slug: "alpha",
			displayName: "Alpha",
			status: "active",
			domainCount: 2,
			memberCount: 2,
			microsoftEnabled: true,
		});
		expect(byId.get(b.id)).toMatchObject({
			status: "suspended",
			domainCount: 1,
			memberCount: 1,
			microsoftEnabled: false,
		});
	});
});

describe("getTenantDetailAction", () => {
	test("returns domains, flags and auth config without the Azure secret", async () => {
		const tenant = await createTenant({
			slug: "hassia",
			features: ["drinks.markup"],
		});
		await setAuthConfig(tenant.id, {
			...microsoftConfig(7),
			mailSenderEmail: "kasse@hassia.example",
		});
		await signInAsSuperAdmin();

		const result = await getTenantDetailAction(tenant.id);

		expect(result.success).toBe(true);
		expect(result.data).toMatchObject({
			tenant: { id: tenant.id, slug: "hassia", status: "active" },
			domains: [
				{
					hostname: "hassia.test.localhost",
					isPrimary: true,
					verifiedAt: null,
				},
			],
			authConfig: {
				emailPasswordEnabled: true,
				microsoftEnabled: true,
				azureClientId: "client-7",
				azureTenantId: "azure-tenant-7",
				hasAzureSecret: true,
				mailSenderEmail: "kasse@hassia.example",
			},
			memberCount: 1,
			features: { ...defaultFeatureFlags(), "drinks.markup": true },
		});
		expect(JSON.stringify(result)).not.toContain("secret-7");
	});

	test("reports unknown tenants and tenants without auth config", async () => {
		const tenant = await createTenant();
		await signInAsSuperAdmin();

		expect(await getTenantDetailAction("nope")).toEqual({
			success: false,
			error: "Tenant not found",
		});
		expect(
			(await getTenantDetailAction(tenant.id)).data?.authConfig,
		).toBeNull();
	});
});

describe("setTenantFeatureAction", () => {
	test("switches a flag on and off, recording who changed it", async () => {
		const tenant = await createTenant();
		const operator = await signInAsSuperAdmin();
		expect((await getTenantById(tenant.id))?.features["drinks.markup"]).toBe(
			false,
		);

		expect(
			await setTenantFeatureAction(tenant.id, "drinks.markup", true),
		).toEqual({ success: true });
		// Visible right away on this instance (the cached tenant is dropped).
		expect((await getTenantById(tenant.id))?.features["drinks.markup"]).toBe(
			true,
		);

		await setTenantFeatureAction(tenant.id, "drinks.markup", false);
		const rows = await controlDb().select().from(tenantFeatures);
		expect(rows).toEqual([
			expect.objectContaining({
				tenantId: tenant.id,
				key: "drinks.markup",
				enabled: false,
				updatedBy: operator.id,
			}),
		]);
	});

	test("rejects unknown flags and unknown tenants", async () => {
		const tenant = await createTenant();
		await signInAsSuperAdmin();

		expect(await setTenantFeatureAction(tenant.id, "beer.free", true)).toEqual({
			success: false,
			error: "Unknown feature: beer.free",
		});
		expect(await setTenantFeatureAction("nope", "drinks.markup", true)).toEqual(
			{ success: false, error: "Tenant not found" },
		);
		expect(await controlDb().select().from(tenantFeatures)).toHaveLength(0);
	});
});

describe("tenant status and name", () => {
	test("suspends and reactivates a tenant", async () => {
		const tenant = await createTenant();
		await signInAsSuperAdmin();
		const status = async () =>
			(
				await controlDb()
					.select({ status: tenants.status })
					.from(tenants)
					.where(eq(tenants.id, tenant.id))
			)[0]?.status;

		await setTenantStatusAction(tenant.id, "suspended");
		expect(await status()).toBe("suspended");
		await setTenantStatusAction(tenant.id, "active");
		expect(await status()).toBe("active");
	});

	test.fails("suspending a tenant takes effect on the next host lookup (#30)", async () => {
		const tenant = await createTenant({ slug: "hassia" });
		expect(await resolveTenantByHost("hassia.test.localhost")).toBe(tenant.id);
		await signInAsSuperAdmin();

		await setTenantStatusAction(tenant.id, "suspended");

		expect(await resolveTenantByHost("hassia.test.localhost")).toBeNull();
	});

	test("renames with a trimmed display name and refuses blanks", async () => {
		const tenant = await createTenant();
		await signInAsSuperAdmin();

		expect(
			await updateTenantDisplayNameAction(tenant.id, "  Corps Hassia  "),
		).toEqual({ success: true });
		expect(await updateTenantDisplayNameAction(tenant.id, "   ")).toEqual({
			success: false,
			error: "Display name is required",
		});
		const [row] = await controlDb()
			.select()
			.from(tenants)
			.where(eq(tenants.id, tenant.id));
		expect(row?.displayName).toBe("Corps Hassia");
	});
});

describe("domains", () => {
	test("adds a normalised, verified domain", async () => {
		const tenant = await createTenant({ slug: "hassia" });
		await signInAsSuperAdmin();

		expect(await addTenantDomainAction(tenant.id, "  WWW.Hassia.DE ")).toEqual({
			success: true,
		});
		expect(
			await addTenantDomainAction(tenant.id, "hassia.localhost", {
				isPrimary: true,
			}),
		).toEqual({ success: true });

		const domains = await domainsOf(tenant.id);
		expect(domains.find((d) => d.hostname === "www.hassia.de")).toMatchObject({
			isPrimary: false,
			isCustom: true,
			verifiedAt: expect.any(Date),
		});
		expect(
			domains.find((d) => d.hostname === "hassia.localhost"),
		).toMatchObject({ isPrimary: true, isCustom: false });
		expect(await resolveTenantByHost("www.hassia.de")).toBe(tenant.id);
	});

	test("rejects blank, malformed and already registered hostnames", async () => {
		const a = await createTenant({ slug: "alpha" });
		const b = await createTenant({ slug: "beta" });
		await signInAsSuperAdmin();

		expect(await addTenantDomainAction(a.id, "  ")).toEqual({
			success: false,
			error: "Hostname is required",
		});
		for (const host of ["https://alpha.de", "alpha.de/path", "al pha.de"]) {
			expect(await addTenantDomainAction(a.id, host)).toEqual({
				success: false,
				error: "Invalid hostname characters",
			});
		}
		expect(await addTenantDomainAction(a.id, "alpha.test.localhost")).toEqual({
			success: false,
			error: "Hostname already registered for this tenant",
		});
		expect(await addTenantDomainAction(a.id, "Beta.Test.Localhost")).toEqual({
			success: false,
			error: "Hostname already registered to another tenant",
		});
		expect(await domainsOf(a.id)).toHaveLength(1);
		expect(await domainsOf(b.id)).toHaveLength(1);
	});

	test.fails("a new domain resolves right after a failed lookup (#30)", async () => {
		const tenant = await createTenant({ slug: "hassia" });
		await signInAsSuperAdmin();
		expect(await resolveTenantByHost("hassia.de")).toBeNull();

		await addTenantDomainAction(tenant.id, "hassia.de");

		expect(await resolveTenantByHost("hassia.de")).toBe(tenant.id);
	});

	test("removes a domain only through its own tenant", async () => {
		const a = await createTenant();
		const b = await createTenant();
		const domain = await addDomain(a.id, "alpha.example");
		await signInAsSuperAdmin();

		await removeTenantDomainAction(b.id, domain.id);
		expect(await domainsOf(a.id)).toHaveLength(2);

		expect(await removeTenantDomainAction(a.id, domain.id)).toEqual({
			success: true,
		});
		expect((await domainsOf(a.id)).map((d) => d.hostname)).toEqual([
			`${a.slug}.test.localhost`,
		]);
	});
});

describe("updateTenantAuthConfigAction", () => {
	const configOf = async (tenantId: string) =>
		(
			await controlDb()
				.select()
				.from(tenantAuthConfig)
				.where(eq(tenantAuthConfig.tenantId, tenantId))
		)[0];

	test("creates the config on first save with email/password enabled", async () => {
		const tenant = await createTenant();
		await signInAsSuperAdmin();

		await updateTenantAuthConfigAction(tenant.id, {
			azureClientId: "client",
			mailSenderEmail: "mail@corps.example",
		});

		expect(await configOf(tenant.id)).toMatchObject({
			emailPasswordEnabled: true,
			microsoftEnabled: false,
			azureClientId: "client",
			azureClientSecret: null,
			azureTenantId: null,
			mailSenderEmail: "mail@corps.example",
		});
	});

	test("patches only the given fields and can clear a field with null", async () => {
		const tenant = await createTenant();
		await setAuthConfig(tenant.id, microsoftConfig(3));
		await signInAsSuperAdmin();

		await updateTenantAuthConfigAction(tenant.id, {
			azureClientSecret: "rotated",
			azureTenantId: null,
		});
		await updateTenantAuthConfigAction(tenant.id, {});

		expect(await configOf(tenant.id)).toMatchObject({
			microsoftEnabled: true,
			azureClientId: "client-3",
			azureClientSecret: "rotated",
			azureTenantId: null,
		});
	});

	test("ignores fields outside the allowlist", async () => {
		const tenant = await createTenant();
		await setAuthConfig(tenant.id, {});
		await signInAsSuperAdmin();

		await updateTenantAuthConfigAction(tenant.id, {
			microsoftEnabled: true,
			emailPasswordEnabled: false,
			tenantId: "other",
		} as never);

		const rows = await controlDb()
			.select()
			.from(tenantAuthConfig)
			.where(eq(tenantAuthConfig.tenantId, tenant.id));
		expect(rows).toEqual([
			expect.objectContaining({
				microsoftEnabled: true,
				emailPasswordEnabled: true,
			}),
		]);
	});
});
