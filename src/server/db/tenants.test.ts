// The real tenant DB client cache. `test/setup.ts` replaces this module with
// a double for every other test, so it is loaded with `importActual` here;
// its dependencies (control DB, tenant-config service) are the usual ones.

import { eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { tenants } from "~/server/db/control-schema";
import {
	bumpTenantConfigVersion,
	TENANT_CONFIG_REVALIDATE_MS,
} from "~/server/lib/tenant-config";
import { clearTenantCache } from "~/server/lib/tenant-context";
import {
	controlDb,
	createTenant,
	setupTestDatabases,
} from "../../../test/harness";

type TenantsModule = typeof import("./tenants");
let real: TenantsModule;

beforeAll(async () => {
	real = await vi.importActual<TenantsModule>("./tenants");
});

setupTestDatabases();

afterEach(() => {
	real.clearTenantDbCache();
	vi.useRealTimers();
});

const T0 = new Date("2026-10-26T12:00:00Z").getTime();
const at = (ms: number) => vi.setSystemTime(new Date(T0 + ms));

async function updateElsewhere(
	tenantId: string,
	set: Partial<typeof tenants.$inferInsert>,
) {
	await controlDb().update(tenants).set(set).where(eq(tenants.id, tenantId));
	await bumpTenantConfigVersion(tenantId);
}

async function selectOne(
	db: Awaited<ReturnType<TenantsModule["getTenantDb"]>>,
) {
	return (await db.get<{ one: number }>(sql`select 1 as one`)).one;
}

describe("getTenantDb", () => {
	test("connects to the tenant's DB and reuses the client", async () => {
		const tenant = await createTenant();

		const db = await real.getTenantDb(tenant.id);

		expect(await selectOne(db)).toBe(1);
		expect(await real.getTenantDb(tenant.id)).toBe(db);
		expect((await real.getTenantClient(tenant.id)).closed).toBe(false);
	});

	test("concurrent cold calls share one client", async () => {
		const tenant = await createTenant();

		const clients = await Promise.all([
			real.getTenantClient(tenant.id),
			real.getTenantClient(tenant.id),
			real.getTenantDb(tenant.id).then(() => real.getTenantClient(tenant.id)),
		]);

		expect(new Set(clients).size).toBe(1);
	});

	test("unknown tenants throw TenantNotFoundError", async () => {
		await createTenant();
		await expect(real.getTenantDb("nope")).rejects.toBeInstanceOf(
			real.TenantNotFoundError,
		);
	});

	test("a suspension on this instance stops handing out the client (#30)", async () => {
		const tenant = await createTenant();
		await real.getTenantDb(tenant.id);

		await controlDb()
			.update(tenants)
			.set({ status: "suspended" })
			.where(eq(tenants.id, tenant.id));
		clearTenantCache(tenant.id);

		await expect(real.getTenantDb(tenant.id)).rejects.toThrow(
			`Tenant suspended: ${tenant.id}`,
		);
	});
});

describe("version-bump eviction (#30)", () => {
	test("a rotated token replaces the client; the old one closes after a grace period", async () => {
		vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
		at(0);
		const tenant = await createTenant();
		const before = await real.getTenantClient(tenant.id);

		await updateElsewhere(tenant.id, { dbAuthToken: "rotated" });
		at(TENANT_CONFIG_REVALIDATE_MS - 1);
		expect(await real.getTenantClient(tenant.id)).toBe(before);

		at(TENANT_CONFIG_REVALIDATE_MS);
		const after = await real.getTenantClient(tenant.id);
		expect(after).not.toBe(before);
		expect(before.closed).toBe(false);

		vi.advanceTimersByTime(real.RETIRED_CLIENT_GRACE_MS);
		expect(before.closed).toBe(true);
		expect(after.closed).toBe(false);
	});

	test("a suspension on another instance evicts the client", async () => {
		vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
		at(0);
		const tenant = await createTenant();
		const before = await real.getTenantClient(tenant.id);

		await updateElsewhere(tenant.id, { status: "suspended" });
		at(TENANT_CONFIG_REVALIDATE_MS);

		await expect(real.getTenantDb(tenant.id)).rejects.toThrow(/suspended/);
		vi.advanceTimersByTime(real.RETIRED_CLIENT_GRACE_MS);
		expect(before.closed).toBe(true);

		await updateElsewhere(tenant.id, { status: "active" });
		at(2 * TENANT_CONFIG_REVALIDATE_MS);
		const reactivated = await real.getTenantClient(tenant.id);
		expect(reactivated).not.toBe(before);
		expect(await selectOne(await real.getTenantDb(tenant.id))).toBe(1);
	});

	test("an unrelated bump keeps the client", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		at(0);
		const tenant = await createTenant();
		const before = await real.getTenantClient(tenant.id);

		await updateElsewhere(tenant.id, { displayName: "Neu" });
		at(TENANT_CONFIG_REVALIDATE_MS);

		expect(await real.getTenantClient(tenant.id)).toBe(before);
	});
});

describe("clearTenantDbCache", () => {
	test("closes one tenant's client or all of them", async () => {
		const a = await createTenant();
		const b = await createTenant();
		const clientA = await real.getTenantClient(a.id);
		const clientB = await real.getTenantClient(b.id);

		real.clearTenantDbCache(a.id);
		expect(clientA.closed).toBe(true);
		expect(clientB.closed).toBe(false);
		real.clearTenantDbCache();
		expect(clientB.closed).toBe(true);
	});
});
