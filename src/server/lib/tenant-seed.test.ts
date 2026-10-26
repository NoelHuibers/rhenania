import { describe, expect, test } from "vitest";

import {
	eventTypes,
	kasseConfig,
	kasseTypes,
	memberStatuses,
	roles,
	semesterConfig,
} from "~/server/db/schema";
import {
	createTenant,
	setupTestDatabases,
	tenantDb,
} from "../../../test/harness";
import { DEFAULT_ROLES } from "./tenant-default-config";
import { seedTenantDefaults } from "./tenant-seed";

setupTestDatabases();

describe("seedTenantDefaults", () => {
	test("creates roles, singletons and configurable enums", async () => {
		await createTenant();
		await seedTenantDefaults(tenantDb());

		const roleNames = (await tenantDb().select().from(roles)).map(
			(r) => r.name,
		);
		expect(roleNames.sort()).toEqual(DEFAULT_ROLES.map((r) => r.name).sort());
		expect(await tenantDb().select().from(kasseConfig)).toHaveLength(1);
		expect(await tenantDb().select().from(semesterConfig)).toHaveLength(1);
		expect((await tenantDb().select().from(kasseTypes)).length).toBeGreaterThan(
			0,
		);
		expect((await tenantDb().select().from(eventTypes)).length).toBeGreaterThan(
			0,
		);
		expect(
			(await tenantDb().select().from(memberStatuses)).length,
		).toBeGreaterThan(0);
	});

	test("is idempotent", async () => {
		await createTenant();
		await seedTenantDefaults(tenantDb());
		await seedTenantDefaults(tenantDb());

		expect(await tenantDb().select().from(roles)).toHaveLength(
			DEFAULT_ROLES.length,
		);
		expect(await tenantDb().select().from(kasseConfig)).toHaveLength(1);
	});
});
