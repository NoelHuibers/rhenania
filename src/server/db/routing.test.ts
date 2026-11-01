// The real tenant routing (the rest of the suite uses doubles for these
// modules): getTenantDb() and the request's scope (currentTenantScope) must
// reach the tenant of the request host, never a tenant named in a client
// header, and refuse suspended or unknown tenants.

import { afterEach, describe, expect, test, vi } from "vitest";

import * as tenantSchema from "~/server/db/schema";
import {
	createDrink,
	createTenant,
	setupTestDatabases,
	switchTenant,
} from "../../../test/harness";
import { testState } from "../../../test/state";

vi.unmock("~/server/db/tenants");

setupTestDatabases();

afterEach(async () => {
	const { clearTenantDbCache } = await import("./tenants");
	clearTenantDbCache();
});

describe("getTenantDb (real)", () => {
	test("opens the tenant's own database", async () => {
		const a = await createTenant();
		await createDrink({ name: "Pils" }, a.id);
		const { getTenantDb } = await import("./tenants");

		const db = await getTenantDb(a.id);
		expect(
			(await db.select().from(tenantSchema.drinks)).map((d) => d.name),
		).toEqual(["Pils"]);
	});

	test("refuses suspended and unknown tenants", async () => {
		const t = await createTenant({ status: "suspended" });
		const { getTenantDb, TenantNotFoundError } = await import("./tenants");

		await expect(getTenantDb(t.id)).rejects.toThrow(/suspended/);
		await expect(getTenantDb("nope")).rejects.toBeInstanceOf(
			TenantNotFoundError,
		);
	});
});

describe("the request's scope (real)", () => {
	const drinksOfRequest = async () => {
		const { currentTenantScope } = await import("~/server/lib/tenant-scope");
		const { db } = await currentTenantScope();
		return (await db.select().from(tenantSchema.drinks)).map((d) => d.name);
	};

	test("routes queries to the tenant of the request host", async () => {
		const a = await createTenant();
		const b = await createTenant();
		await createDrink({ name: "A-Pils" }, a.id);
		await createDrink({ name: "B-Cola" }, b.id);

		switchTenant(a);
		expect(await drinksOfRequest()).toEqual(["A-Pils"]);
		switchTenant(b);
		expect(await drinksOfRequest()).toEqual(["B-Cola"]);
	});

	test("ignores a forged x-tenant-id header", async () => {
		const a = await createTenant();
		const b = await createTenant();
		await createDrink({ name: "B-Geheim" }, b.id);

		switchTenant(a);
		testState.headers["x-tenant-id"] = b.id;
		expect(await drinksOfRequest()).toEqual([]);
	});

	test("fails loudly when the host maps to no tenant", async () => {
		await createTenant();
		testState.headers.host = "unknown.test.localhost";

		await expect(drinksOfRequest()).rejects.toThrow(/No tenant/);
	});
});
