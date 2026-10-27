// The real tenant routing (the rest of the suite uses doubles for these
// modules): the shared `db` proxy and getTenantDb() must reach the tenant of
// the request host, never a tenant named in a client header, and refuse
// suspended or unknown tenants.

import { afterEach, describe, expect, test, vi } from "vitest";

import * as tenantSchema from "~/server/db/schema";
import {
	createDrink,
	createTenant,
	setupTestDatabases,
	switchTenant,
} from "../../../test/harness";
import { testState } from "../../../test/state";

vi.unmock("~/server/db");
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

describe("shared db proxy (real)", () => {
	test("routes queries to the tenant of the request host", async () => {
		const a = await createTenant();
		const b = await createTenant();
		await createDrink({ name: "A-Pils" }, a.id);
		await createDrink({ name: "B-Cola" }, b.id);
		const { db } = await import("./index");

		switchTenant(a);
		expect(
			(await db.select().from(tenantSchema.drinks)).map((d) => d.name),
		).toEqual(["A-Pils"]);
		switchTenant(b);
		expect(
			(await db.select().from(tenantSchema.drinks)).map((d) => d.name),
		).toEqual(["B-Cola"]);
	});

	test("ignores a forged x-tenant-id header", async () => {
		const a = await createTenant();
		const b = await createTenant();
		await createDrink({ name: "B-Geheim" }, b.id);
		const { db } = await import("./index");

		switchTenant(a);
		testState.headers["x-tenant-id"] = b.id;
		expect(await db.select().from(tenantSchema.drinks)).toEqual([]);
	});

	test("fails loudly when the host maps to no tenant", async () => {
		await createTenant();
		const { db } = await import("./index");
		testState.headers.host = "unknown.test.localhost";

		const error = (await db
			.select()
			.from(tenantSchema.drinks)
			.catch((e: unknown) => e)) as Error & { cause?: Error };
		expect(error.cause?.message ?? error.message).toMatch(/tenant host/);
	});
});
