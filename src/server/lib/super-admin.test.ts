import { describe, expect, test } from "vitest";

import { grantSuperAdmin } from "../../../test/factories/platform";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../test/harness";
import { isSuperAdmin, requireSuperAdmin } from "./super-admin";

setupTestDatabases();

describe("superadmin checks", () => {
	test("only identities in the super_admin table are superadmins", async () => {
		await createTenant();
		const operator = await createUser();
		const admin = await createUser({ roles: ["Admin"] });
		await grantSuperAdmin(operator.id);

		expect(await isSuperAdmin(operator.id)).toBe(true);
		expect(await isSuperAdmin(admin.id)).toBe(false);
		expect(await isSuperAdmin("unknown")).toBe(false);
	});

	test("requireSuperAdmin rejects anonymous callers and tenant admins", async () => {
		await createTenant();
		await expect(requireSuperAdmin()).rejects.toThrow("Not authenticated");

		signInAs(await createUser({ roles: ["Admin"] }));
		await expect(requireSuperAdmin()).rejects.toThrow("Superadmin required");
	});

	test("requireSuperAdmin returns the operator id, without any membership", async () => {
		await createTenant();
		const operator = await createUser({ tenantId: null });
		await grantSuperAdmin(operator.id);
		signInAs(operator);

		expect(await requireSuperAdmin()).toEqual({ userId: operator.id });
	});
});
