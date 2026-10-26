import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
	accounts,
	users as controlUsers,
	sessions,
	tenantMemberships,
	userStats,
} from "~/server/db/control-schema";
import {
	bills,
	homepageImages,
	members,
	orders,
	roles,
	userRoles,
	users,
} from "~/server/db/schema";
import {
	createAccount,
	createBill,
	createHomepageImage,
} from "../../../../test/factories/platform";
import {
	controlDb,
	createDrink,
	createTenant,
	createUser,
	ensureRole,
	setupTestDatabases,
	signInAs,
	switchTenant,
	tenantDb,
} from "../../../../test/harness";
import {
	assignUserRole,
	bulkSetRoleUsers,
	deleteUser,
	getRolesWithUserCount,
	getUsersWithRoles,
	initializeRoles,
	removeUserRole,
	toggleUserRole,
	updateUser,
} from "./admin";

setupTestDatabases();

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});

async function asAdmin() {
	const tenant = await createTenant();
	const admin = await createUser({ name: "Admin", roles: ["Admin"] });
	signInAs(admin);
	return { tenant, admin };
}

const roleIdsOf = async (userId: string) =>
	(
		await tenantDb()
			.select({ roleId: userRoles.roleId })
			.from(userRoles)
			.where(eq(userRoles.userId, userId))
	).map((r) => r.roleId);

describe("listing", () => {
	test("getUsersWithRoles groups roles per user, including users without roles", async () => {
		const { admin } = await asAdmin();
		const fuchs = await createUser({
			name: "Fuchs",
			roles: ["Fuchs", "Hausbewohner"],
		});
		const plain = await createUser({ name: "Ohne" });

		const list = await getUsersWithRoles();

		const byId = new Map(list.map((u) => [u.id, u]));
		expect(list).toHaveLength(3);
		expect(byId.get(admin.id)?.roles.map((r) => r.name)).toEqual(["Admin"]);
		expect(
			byId
				.get(fuchs.id)
				?.roles.map((r) => r.name)
				.sort(),
		).toEqual(["Fuchs", "Hausbewohner"]);
		expect(byId.get(plain.id)).toEqual({
			id: plain.id,
			name: "Ohne",
			email: plain.email,
			emailVerified: true,
			image: null,
			roles: [],
		});
	});

	test("getRolesWithUserCount counts members per role with Admin first", async () => {
		await asAdmin();
		await createUser({ roles: ["Senior"] });
		await createUser({ roles: ["Senior", "Consenior"] });
		await ensureRole("Aktivenkasse");

		const list = await getRolesWithUserCount();

		expect(list.map((r) => [r.name, r.userCount])).toEqual([
			["Admin", 1],
			["Aktivenkasse", 0],
			["Consenior", 1],
			["Senior", 2],
		]);
	});
});

describe("initializeRoles", () => {
	test("adds the default roles once and keeps existing descriptions", async () => {
		await asAdmin();
		await tenantDb()
			.insert(roles)
			.values({ name: "Senior", description: "Eigene Beschreibung" });

		await initializeRoles();
		await initializeRoles();

		const all = await tenantDb().select().from(roles);
		expect(all).toHaveLength(18);
		expect(all.find((r) => r.name === "Senior")?.description).toBe(
			"Eigene Beschreibung",
		);
		expect(all.map((r) => r.name)).toEqual(
			expect.arrayContaining([
				"Getränkewart",
				"CC-Kasse",
				"AHV 1. Vorstand",
				"Hausverein 3. Vorstand",
			]),
		);
	});
});

describe("role assignment", () => {
	test("assign, remove and toggle are idempotent per user and role", async () => {
		await asAdmin();
		const member = await createUser();
		const senior = await ensureRole("Senior");

		await assignUserRole(member.id, senior);
		await assignUserRole(member.id, senior);
		expect(await roleIdsOf(member.id)).toEqual([senior]);

		await removeUserRole(member.id, senior);
		await removeUserRole(member.id, senior);
		expect(await roleIdsOf(member.id)).toEqual([]);

		await toggleUserRole(member.id, senior);
		expect(await roleIdsOf(member.id)).toEqual([senior]);
		await toggleUserRole(member.id, senior);
		expect(await roleIdsOf(member.id)).toEqual([]);
	});

	test("assigning an unknown role fails", async () => {
		await asAdmin();
		const member = await createUser();

		await expect(assignUserRole(member.id, "nope")).rejects.toThrow(
			"Failed to assign role",
		);
		await expect(toggleUserRole(member.id, "nope")).rejects.toThrow(
			"Failed to toggle role",
		);
	});

	test("bulkSetRoleUsers makes the role's member list match the selection", async () => {
		await asAdmin();
		const a = await createUser({ roles: ["CC-Kasse"] });
		const b = await createUser({ roles: ["CC-Kasse"] });
		const c = await createUser();
		const role = await ensureRole("CC-Kasse");

		await bulkSetRoleUsers(role, [b.id, c.id]);

		const holders = await tenantDb()
			.select({ userId: userRoles.userId })
			.from(userRoles)
			.where(eq(userRoles.roleId, role));
		expect(holders.map((h) => h.userId).sort()).toEqual([b.id, c.id].sort());
		expect(await roleIdsOf(a.id)).toEqual([]);

		await bulkSetRoleUsers(role, []);
		expect(
			await tenantDb()
				.select()
				.from(userRoles)
				.where(eq(userRoles.roleId, role)),
		).toHaveLength(0);
	});
});

describe("updateUser", () => {
	test("updates name and e-mail on the identity and the tenant mirror", async () => {
		await asAdmin();
		const member = await createUser({ name: "Alt" });

		await updateUser(member.id, { name: "Neu", email: "neu@example.test" });

		const [identity] = await controlDb()
			.select()
			.from(controlUsers)
			.where(eq(controlUsers.id, member.id));
		const [mirror] = await tenantDb()
			.select()
			.from(users)
			.where(eq(users.id, member.id));
		expect(identity).toMatchObject({ name: "Neu", email: "neu@example.test" });
		expect(mirror).toMatchObject({ name: "Neu", email: "neu@example.test" });
	});

	test("an e-mail already used by another identity is refused", async () => {
		await asAdmin();
		const member = await createUser({ email: "a@example.test" });
		await createUser({ email: "b@example.test" });

		await expect(
			updateUser(member.id, { email: "b@example.test" }),
		).rejects.toThrow("Failed to update user");
	});
});

describe("deleteUser", () => {
	async function memberWithHistory() {
		const member = await createUser({ name: "Weg", roles: ["Fotowart"] });
		const drink = await createDrink();
		await tenantDb().insert(orders).values({
			userId: member.id,
			userName: "Weg",
			drinkId: drink.id,
			drinkName: drink.name,
			amount: 1,
			pricePerUnit: 1,
			total: 1,
		});
		await createBill({
			userId: member.id,
			items: [{ drinkName: "Pils", amount: 1, price: 1 }],
		});
		const image = await createHomepageImage({
			section: "header",
			uploadedBy: member.id,
		});
		await tenantDb().insert(members).values({
			userId: member.id,
			status: "CB",
			firstName: "Willi",
			lastName: "Weg",
		});
		await createAccount(member.id, "credential", { password: "hash" });
		await controlDb()
			.insert(sessions)
			.values({
				token: `token-${member.id}`,
				userId: member.id,
				expiresAt: new Date(Date.now() + 60_000),
			});
		await controlDb().insert(userStats).values({ userId: member.id });
		return { member, image };
	}

	test("a member of only this Corps is removed completely", async () => {
		await asAdmin();
		const { member, image } = await memberWithHistory();

		await deleteUser(member.id);

		const t = tenantDb();
		expect(await t.select().from(users).where(eq(users.id, member.id))).toEqual(
			[],
		);
		expect(await t.select().from(orders)).toEqual([]);
		expect(await t.select().from(bills)).toEqual([]);
		expect(await roleIdsOf(member.id)).toEqual([]);
		const [img] = await t
			.select()
			.from(homepageImages)
			.where(eq(homepageImages.id, image.id));
		expect(img?.uploadedBy).toBeNull();
		const [entry] = await t.select().from(members);
		expect(entry).toMatchObject({ lastName: "Weg", userId: null });

		const c = controlDb();
		expect(
			await c
				.select()
				.from(tenantMemberships)
				.where(eq(tenantMemberships.userId, member.id)),
		).toEqual([]);
		expect(
			await c.select().from(controlUsers).where(eq(controlUsers.id, member.id)),
		).toEqual([]);
		expect(
			await c.select().from(accounts).where(eq(accounts.userId, member.id)),
		).toEqual([]);
		expect(
			await c.select().from(sessions).where(eq(sessions.userId, member.id)),
		).toEqual([]);
		expect(await c.select().from(userStats)).toEqual([]);
	});

	test("a member of several Corps only leaves this one; the identity stays", async () => {
		const other = await createTenant();
		const tenant = await createTenant();
		switchTenant(tenant);
		signInAs(await createUser({ roles: ["Admin"] }));
		const member = await createUser({ name: "Doppel", tenantId: tenant.id });
		await controlDb()
			.insert(tenantMemberships)
			.values({ userId: member.id, tenantId: other.id });
		await tenantDb(other.id)
			.insert(users)
			.values({ ...member, emailVerified: true });
		await createAccount(member.id, "credential", { password: "hash" });
		await controlDb().insert(userStats).values({ userId: member.id });

		await deleteUser(member.id);

		expect(
			await tenantDb().select().from(users).where(eq(users.id, member.id)),
		).toEqual([]);
		expect(
			await tenantDb(other.id)
				.select()
				.from(users)
				.where(eq(users.id, member.id)),
		).toHaveLength(1);
		const memberships = await controlDb()
			.select({ tenantId: tenantMemberships.tenantId })
			.from(tenantMemberships)
			.where(eq(tenantMemberships.userId, member.id));
		expect(memberships).toEqual([{ tenantId: other.id }]);
		expect(
			await controlDb()
				.select()
				.from(controlUsers)
				.where(eq(controlUsers.id, member.id)),
		).toHaveLength(1);
		expect(
			await controlDb()
				.select()
				.from(accounts)
				.where(eq(accounts.userId, member.id)),
		).toHaveLength(1);
		expect(await controlDb().select().from(userStats)).toHaveLength(1);
	});
});
