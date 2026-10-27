import { describe, expect, test, vi } from "vitest";

import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../../test/harness";
import { requireTenant } from "../../../../test/state";
import { getUserRoles, hasAnyRole, hasRole } from "./userRoles";

setupTestDatabases();

async function asAdmin() {
	await createTenant();
	const admin = await createUser({ roles: ["Admin"] });
	signInAs(admin);
	return admin;
}

describe("role queries", () => {
	test("getUserRoles and hasRole/hasAnyRole read the tenant's assignments", async () => {
		await asAdmin();
		const member = await createUser({ roles: ["Senior", "Hausbewohner"] });

		expect((await getUserRoles(member.id)).map((r) => r.name).sort()).toEqual([
			"Hausbewohner",
			"Senior",
		]);
		expect(await hasRole(member.id, "Senior")).toBe(true);
		expect(await hasRole(member.id, "Admin")).toBe(false);
		expect(await hasAnyRole(member.id, ["Admin", "Senior"])).toBe(true);
		expect(await hasAnyRole(member.id, ["Admin", "Fuchs"])).toBe(false);
		expect(await hasAnyRole(member.id, [])).toBe(false);
	});

	test("role checks fail loudly on DB errors (the membership check runs first)", async () => {
		await asAdmin();
		const member = await createUser({ roles: ["Senior"] });
		vi.spyOn(console, "error").mockImplementation(() => {});
		await requireTenant().client.execute("DROP TABLE user_role");

		await expect(hasRole(member.id, "Senior")).rejects.toThrow();
		await expect(hasAnyRole(member.id, ["Senior"])).rejects.toThrow();
		await expect(getUserRoles(member.id)).rejects.toThrow();
	});
});
