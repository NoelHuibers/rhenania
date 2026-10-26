import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { tenantFeatures, tenants } from "~/server/db/control-schema";
import { addDomain, setAuthConfig } from "../../../test/factories/platform";
import {
	controlDb,
	createTenant,
	setupTestDatabases,
} from "../../../test/harness";
import { requireControl } from "../../../test/state";
import {
	bumpTenantConfigVersion,
	commitTenantConfigChange,
	getTenantConfig,
	lookupTenantIdByHost,
	TENANT_CONFIG_MAX_AGE_MS,
	TENANT_CONFIG_REVALIDATE_MS,
} from "./tenant-config";

setupTestDatabases();

afterEach(() => {
	vi.useRealTimers();
});

const T0 = new Date("2026-10-26T12:00:00Z").getTime();
const at = (ms: number) => vi.setSystemTime(new Date(T0 + ms));

/**
 * A superadmin write made on ANOTHER instance: it reaches the control DB
 * with its version bump, but this instance's cache is not told about it.
 */
async function writeElsewhere(
	tenantId: string,
	write: () => Promise<unknown>,
): Promise<void> {
	await write();
	await bumpTenantConfigVersion(tenantId);
}

describe("changes made on another instance", () => {
	test("a suspension is seen after one revalidation interval", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		at(0);
		const tenant = await createTenant({ slug: "hassia" });
		expect(await lookupTenantIdByHost("hassia.test.localhost")).toBe(tenant.id);

		await writeElsewhere(tenant.id, () =>
			controlDb()
				.update(tenants)
				.set({ status: "suspended" })
				.where(eq(tenants.id, tenant.id)),
		);

		at(TENANT_CONFIG_REVALIDATE_MS - 1);
		expect(await lookupTenantIdByHost("hassia.test.localhost")).toBe(tenant.id);
		at(TENANT_CONFIG_REVALIDATE_MS);
		expect(await lookupTenantIdByHost("hassia.test.localhost")).toBeNull();
		expect((await getTenantConfig(tenant.id))?.status).toBe("suspended");
	});

	test("a cached miss does not outlive a new domain", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		at(0);
		const tenant = await createTenant({ slug: "hassia" });
		expect(await lookupTenantIdByHost("hassia.de")).toBeNull();

		await writeElsewhere(tenant.id, () => addDomain(tenant.id, "hassia.de"));

		at(TENANT_CONFIG_REVALIDATE_MS);
		expect(await lookupTenantIdByHost("hassia.de")).toBe(tenant.id);
	});

	test("flag and mail config changes are picked up together", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		at(0);
		const tenant = await createTenant();
		const before = await getTenantConfig(tenant.id);
		expect(before?.features["drinks.markup"]).toBe(false);
		expect(before?.graphMail).toBeNull();

		await writeElsewhere(tenant.id, async () => {
			await controlDb()
				.insert(tenantFeatures)
				.values({ tenantId: tenant.id, key: "drinks.markup", enabled: true });
			await setAuthConfig(tenant.id, {
				azureClientId: "client",
				azureClientSecret: "secret",
				azureTenantId: "azure",
				mailSenderEmail: "kasse@corps.example",
			});
		});

		at(TENANT_CONFIG_REVALIDATE_MS);
		const after = await getTenantConfig(tenant.id);
		expect(after?.features["drinks.markup"]).toBe(true);
		expect(after?.graphMail).toEqual({
			clientId: "client",
			clientSecret: "secret",
			azureTenantId: "azure",
			senderEmail: "kasse@corps.example",
		});
	});

	test("a new or deleted tenant changes the fingerprint too", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		at(0);
		const a = await createTenant({ slug: "alpha" });
		expect(await lookupTenantIdByHost("beta.test.localhost")).toBeNull();

		const b = await createTenant({ slug: "beta" });
		at(TENANT_CONFIG_REVALIDATE_MS);
		expect(await lookupTenantIdByHost("beta.test.localhost")).toBe(b.id);

		await controlDb().delete(tenants).where(eq(tenants.id, a.id));
		at(2 * TENANT_CONFIG_REVALIDATE_MS);
		expect(await lookupTenantIdByHost("alpha.test.localhost")).toBeNull();
		expect(await getTenantConfig(a.id)).toBeNull();
	});

	test("writes that skip the bump expire after the max age", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		at(0);
		const tenant = await createTenant({ displayName: "Alt" });
		await getTenantConfig(tenant.id);
		await controlDb()
			.update(tenants)
			.set({ displayName: "Neu" })
			.where(eq(tenants.id, tenant.id));

		at(TENANT_CONFIG_MAX_AGE_MS - 1);
		expect((await getTenantConfig(tenant.id))?.displayName).toBe("Alt");
		at(TENANT_CONFIG_MAX_AGE_MS + 1);
		expect((await getTenantConfig(tenant.id))?.displayName).toBe("Neu");
	});
});

describe("revalidation cost", () => {
	test("checks the version at most once per interval, with one query", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		at(0);
		const tenant = await createTenant({ slug: "hassia" });
		await lookupTenantIdByHost("hassia.test.localhost");
		await getTenantConfig(tenant.id);
		const execute = vi.spyOn(requireControl().client, "execute");

		for (let i = 0; i < 20; i++) {
			await lookupTenantIdByHost("hassia.test.localhost");
			await getTenantConfig(tenant.id);
		}
		expect(execute).not.toHaveBeenCalled();

		at(TENANT_CONFIG_REVALIDATE_MS);
		await Promise.all([
			lookupTenantIdByHost("hassia.test.localhost"),
			getTenantConfig(tenant.id),
		]);
		expect(execute).toHaveBeenCalledTimes(1);
	});

	test("without the configVersion column it falls back to a short TTL", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		at(0);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const tenant = await createTenant({ slug: "hassia", displayName: "Alt" });
		await requireControl().client.execute(
			"ALTER TABLE control_tenant DROP COLUMN configVersion",
		);

		expect(await lookupTenantIdByHost("hassia.test.localhost")).toBe(tenant.id);
		await requireControl().client.execute(
			"UPDATE control_tenant SET displayName = 'Neu'",
		);
		expect((await getTenantConfig(tenant.id))?.displayName).toBe("Neu");
		await requireControl().client.execute(
			"UPDATE control_tenant SET displayName = 'Neuer'",
		);
		expect((await getTenantConfig(tenant.id))?.displayName).toBe("Neu");

		at(TENANT_CONFIG_REVALIDATE_MS);
		expect((await getTenantConfig(tenant.id))?.displayName).toBe("Neuer");
		expect(error).toHaveBeenCalledTimes(1);
	});
});

describe("commitTenantConfigChange", () => {
	test("writes atomically with the bump and is visible here at once", async () => {
		const a = await createTenant({ displayName: "A" });
		const b = await createTenant({ displayName: "B" });
		await getTenantConfig(a.id);

		await commitTenantConfigChange(a.id, [
			controlDb()
				.update(tenants)
				.set({ displayName: "A2" })
				.where(eq(tenants.id, a.id)),
		]);
		await commitTenantConfigChange(b.id, [
			controlDb()
				.update(tenants)
				.set({ displayName: "B2" })
				.where(eq(tenants.id, b.id)),
		]);

		expect((await getTenantConfig(a.id))?.displayName).toBe("A2");
		const versions = await controlDb()
			.select({ id: tenants.id, v: tenants.configVersion })
			.from(tenants);
		expect(new Map(versions.map((r) => [r.id, r.v]))).toEqual(
			new Map([
				[a.id, 1],
				[b.id, 2],
			]),
		);
	});

	test("a failing write leaves the version untouched", async () => {
		const tenant = await createTenant();
		await requireControl().client.execute(
			"CREATE TRIGGER no_names BEFORE UPDATE OF displayName ON control_tenant BEGIN SELECT RAISE(ABORT, 'boom'); END",
		);

		await expect(
			commitTenantConfigChange(tenant.id, [
				controlDb()
					.update(tenants)
					.set({ displayName: "X" })
					.where(eq(tenants.id, tenant.id)),
			]),
		).rejects.toThrow();

		const [row] = await controlDb()
			.select({ v: tenants.configVersion })
			.from(tenants);
		expect(row?.v).toBe(0);
	});
});
