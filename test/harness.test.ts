import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { drinks } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";
import { hasFeature } from "~/server/lib/features";
import {
	getCurrentTenant,
	getTenantId,
	resolveTenantByHost,
} from "~/server/lib/tenant-context";
import {
	controlDb,
	countQueries,
	createDrink,
	createTenant,
	createUser,
	setFeature,
	setupTestDatabases,
	signInAs,
	switchTenant,
	tenantDb,
} from "./harness";
import { testState } from "./state";

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

	test("auth() is scoped to active members of the request tenant", async () => {
		const a = await createTenant();
		const b = await createTenant();
		const user = await createUser({ roles: ["Getränkewart"], tenantId: a.id });
		signInAs(user);

		switchTenant(a);
		expect((await auth())?.user.roles).toEqual(["Getränkewart"]);
		switchTenant(b);
		expect(await auth()).toBeNull();
	});

	test("suspended members get no session in the tenant", async () => {
		await createTenant();
		const user = await createUser({
			roles: ["Admin"],
			membership: "suspended",
		});
		signInAs(user);
		expect(await auth()).toBeNull();
	});

	test("a forged x-tenant-id header cannot switch the tenant", async () => {
		const a = await createTenant();
		const b = await createTenant();
		await createDrink({ name: "Nur in B" }, b.id);
		switchTenant(a);
		testState.headers["x-tenant-id"] = b.id;

		expect(await getTenantId()).toBe(a.id);
		expect(await db.select().from(drinks)).toHaveLength(0);
	});

	test("countQueries counts round trips per database, batches as one", async () => {
		await createTenant();
		const drink = await createDrink({ name: "Pils" });

		const counted = await countQueries(async () => {
			await db.select().from(drinks);
			await db.batch([
				db.select().from(drinks),
				db.update(drinks).set({ price: 2 }).where(eq(drinks.id, drink.id)),
			]);
			await controlDb().query.tenants.findMany();
			await db.transaction(async (tx) => {
				await tx.update(drinks).set({ price: 3 });
			});
			return "done";
		});

		expect(counted.result).toBe("done");
		expect(counted).toMatchObject({ tenant: 4, control: 1, total: 5 });
		// The batch and the transaction's UPDATE write; the commit does not.
		expect(counted.writes).toBe(2);
		expect(counted.log.map((e) => e.kind)).toEqual([
			"execute",
			"batch",
			"execute",
			"transaction",
			"transaction",
		]);
		// Arguments are logged per statement, so tests can replay them.
		expect(counted.log[1]?.args).toEqual([
			[],
			[2, expect.any(Number), drink.id],
		]);
		for (const entry of counted.log) {
			expect(entry.args).toHaveLength(entry.sql.length);
		}
	});
});
