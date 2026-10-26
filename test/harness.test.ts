import { describe, expect, test } from "vitest";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { drinks } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";
import { hasFeature } from "~/server/lib/features";
import {
	getCurrentTenant,
	resolveTenantByHost,
} from "~/server/lib/tenant-context";
import {
	createDrink,
	createTenant,
	createUser,
	setFeature,
	setupTestDatabases,
	signInAs,
	switchTenant,
	tenantDb,
} from "./harness";

setupTestDatabases();

describe("test harness", () => {
	test("guards against remote databases", () => {
		expect(process.env.DATABASE_URL).toMatch(/^file:/);
		expect(process.env.CONTROL_DATABASE_URL).toMatch(/^file:/);
		expect(process.env.TURSO_PLATFORM_TOKEN ?? "").toBe("");
	});

	test("each tenant gets its own migrated database", async () => {
		const a = await createTenant();
		const b = await createTenant();
		await createDrink({ name: "Pils" }, a.id);

		expect(await tenantDb(a.id).select().from(drinks)).toHaveLength(1);
		expect(await tenantDb(b.id).select().from(drinks)).toHaveLength(0);
	});

	test("the shared db proxy and getCurrentTenantDb follow the request tenant", async () => {
		const a = await createTenant();
		const b = await createTenant();
		await createDrink({ name: "Pils" }, a.id);

		switchTenant(a);
		expect(await db.select().from(drinks)).toHaveLength(1);
		switchTenant(b);
		expect(await db.select().from(drinks)).toHaveLength(0);
		expect(
			await (await getCurrentTenantDb()).select().from(drinks),
		).toHaveLength(0);
	});

	test("real tenant context resolves hosts and feature flags from the control DB", async () => {
		const tenant = await createTenant({
			slug: "hassia",
			features: ["drinks.markup"],
		});

		expect(await resolveTenantByHost("hassia.test.localhost")).toBe(tenant.id);
		expect((await getCurrentTenant())?.slug).toBe("hassia");
		expect(await hasFeature("drinks.markup")).toBe(true);

		await setFeature("drinks.markup", false);
		expect(await hasFeature("drinks.markup")).toBe(false);
	});

	test("auth() attaches roles only for active members of the request tenant", async () => {
		const a = await createTenant();
		const b = await createTenant();
		const user = await createUser({ roles: ["Getränkewart"], tenantId: a.id });
		signInAs(user);

		switchTenant(a);
		expect((await auth())?.user.roles).toEqual(["Getränkewart"]);
		switchTenant(b);
		expect((await auth())?.user.roles).toEqual([]);
	});

	test("suspended memberships get no roles", async () => {
		await createTenant();
		const user = await createUser({
			roles: ["Admin"],
			membership: "suspended",
		});
		signInAs(user);
		expect((await auth())?.user.roles).toEqual([]);
	});
});
