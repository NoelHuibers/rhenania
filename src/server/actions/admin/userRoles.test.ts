import { describe, expect, test, vi } from "vitest";

import { userRoles } from "~/server/db/schema";
import {
	createTenant,
	createUser,
	ensureRole,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import { requireTenant } from "../../../../test/state";
import {
	assignRoleToUser,
	createRole,
	getAllRoles,
	getUserRoles,
	hasAnyRole,
	hasRole,
	removeRoleFromUser,
} from "./userRoles";

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

	test("role checks answer false instead of throwing on DB errors", async () => {
		await asAdmin();
		const member = await createUser({ roles: ["Senior"] });
		vi.spyOn(console, "error").mockImplementation(() => {});
		await requireTenant().client.execute("DROP TABLE user_role");

		expect(await hasRole(member.id, "Senior")).toBe(false);
		expect(await hasAnyRole(member.id, ["Senior"])).toBe(false);
		await expect(getUserRoles(member.id)).rejects.toThrow(
			"Failed to fetch user roles",
		);
	});

	test("getAllRoles lists every role", async () => {
		await asAdmin();
		await ensureRole("Fotowart");

		expect((await getAllRoles()).map((r) => r.name).sort()).toEqual([
			"Admin",
			"Fotowart",
		]);
	});
});

describe("assignRoleToUser / removeRoleFromUser", () => {
	test("assigns once, recording who assigned it, then removes", async () => {
		const admin = await asAdmin();
		const member = await createUser();
		const fm = await ensureRole("Fuchsmajor");

		expect(await assignRoleToUser(member.id, fm, admin.id)).toEqual({
			success: true,
			message: "Role assigned successfully",
		});
		expect(await assignRoleToUser(member.id, fm, admin.id)).toEqual({
			success: false,
			message: "User already has this role",
		});
		const rows = await tenantDb().select().from(userRoles);
		expect(rows.find((r) => r.userId === member.id)).toMatchObject({
			roleId: fm,
			assignedBy: admin.id,
		});

		expect(await removeRoleFromUser(member.id, fm)).toEqual({
			success: true,
			message: "Role removed successfully",
		});
		expect(await hasRole(member.id, "Fuchsmajor")).toBe(false);
	});

	test("refuses unknown users and roles", async () => {
		await asAdmin();
		const member = await createUser();
		const fm = await ensureRole("Fuchsmajor");

		expect(await assignRoleToUser("ghost", fm)).toEqual({
			success: false,
			message: "User not found",
		});
		expect(await assignRoleToUser(member.id, "ghost-role")).toEqual({
			success: false,
			message: "Role not found",
		});
	});
});

describe("createRole", () => {
	test("creates a role with a unique name", async () => {
		await asAdmin();

		const created = await createRole("Kneipwart", "Kneipen organisieren");
		expect(created).toEqual({
			success: true,
			message: "Role created successfully",
			roleId: expect.any(String),
		});
		expect(await createRole("Kneipwart")).toEqual({
			success: false,
			message: "Role with this name already exists",
		});
		expect((await getAllRoles()).find((r) => r.id === created.roleId)).toEqual({
			id: created.roleId,
			name: "Kneipwart",
			description: "Kneipen organisieren",
		});
	});
});
