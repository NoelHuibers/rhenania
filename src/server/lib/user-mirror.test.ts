import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import {
	users as controlUsers,
	tenantMemberships,
} from "~/server/db/control-schema";
import { users } from "~/server/db/schema";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	tenantDb,
} from "../../../test/harness";
import { testState } from "../../../test/state";
import {
	type MirroredUser,
	mirrorUserToAllMemberTenants,
	mirrorUserToTenant,
	updateUserIdentity,
} from "./user-mirror";

setupTestDatabases();

const identity = (overrides: Partial<MirroredUser> = {}): MirroredUser => ({
	id: randomUUID(),
	name: "Max Muster",
	email: "max@example.test",
	emailVerified: false,
	image: null,
	createdAt: new Date("2026-01-01T10:00:00Z"),
	updatedAt: new Date("2026-01-01T10:00:00Z"),
	...overrides,
});

const mirrorOf = async (userId: string, tenantId?: string) =>
	(
		await tenantDb(tenantId).select().from(users).where(eq(users.id, userId))
	)[0];

describe("mirrorUserToTenant", () => {
	test("inserts the identity into the tenant DB", async () => {
		const tenant = await createTenant();
		const user = identity();

		await mirrorUserToTenant(user, tenant.id);

		expect(await mirrorOf(user.id)).toEqual(user);
	});

	test("updates an existing mirror but keeps its creation date", async () => {
		const tenant = await createTenant();
		const user = identity();
		await mirrorUserToTenant(user, tenant.id);

		const changed = {
			...user,
			name: "Max Neu",
			email: "neu@example.test",
			emailVerified: true,
			image: "https://img.example/max.png",
			createdAt: new Date("2030-01-01T00:00:00Z"),
			updatedAt: new Date("2026-02-01T10:00:00Z"),
		};
		await mirrorUserToTenant(changed, tenant.id);

		expect(await mirrorOf(user.id)).toEqual({
			...changed,
			createdAt: user.createdAt,
		});
	});
});

describe("mirrorUserToAllMemberTenants", () => {
	test("updates the mirror in every tenant the user belongs to", async () => {
		const a = await createTenant();
		const b = await createTenant();
		const outsider = await createTenant();
		const user = await createUser({ name: "Alt", tenantId: a.id });
		await controlDb()
			.insert(tenantMemberships)
			.values({ userId: user.id, tenantId: b.id, status: "suspended" });

		await mirrorUserToAllMemberTenants(
			identity({ id: user.id, email: user.email, name: "Neu" }),
		);

		expect((await mirrorOf(user.id, a.id))?.name).toBe("Neu");
		expect((await mirrorOf(user.id, b.id))?.name).toBe("Neu");
		expect(await mirrorOf(user.id, outsider.id)).toBeUndefined();
	});

	test("a failing tenant is logged and does not stop the others", async () => {
		const a = await createTenant();
		const unreachable = await createTenant();
		const user = await createUser({ tenantId: a.id });
		await controlDb()
			.insert(tenantMemberships)
			.values({ userId: user.id, tenantId: unreachable.id });
		testState.tenants.get(unreachable.id)?.close();
		testState.tenants.delete(unreachable.id);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(
			mirrorUserToAllMemberTenants(
				identity({ id: user.id, email: user.email, name: "Neu" }),
			),
		).resolves.toBeUndefined();

		expect((await mirrorOf(user.id, a.id))?.name).toBe("Neu");
		expect(error).toHaveBeenCalledWith(
			`Failed to mirror user ${user.id} to tenant ${unreachable.id}:`,
			expect.any(Error),
		);
	});

	test("does nothing for users without memberships", async () => {
		await createTenant();
		await expect(
			mirrorUserToAllMemberTenants(identity()),
		).resolves.toBeUndefined();
		expect(await tenantDb().select().from(users)).toHaveLength(0);
	});
});

describe("updateUserIdentity", () => {
	test("writes the global identity and every member tenant's mirror", async () => {
		const a = await createTenant();
		const b = await createTenant();
		const user = await createUser({ name: "Alt", tenantId: a.id });
		await controlDb()
			.insert(tenantMemberships)
			.values({ userId: user.id, tenantId: b.id });

		const updated = await updateUserIdentity(user.id, {
			name: "Neu",
			image: "https://img.example/neu.png",
		});

		expect(updated).toMatchObject({ id: user.id, name: "Neu" });
		const [stored] = await controlDb()
			.select()
			.from(controlUsers)
			.where(eq(controlUsers.id, user.id));
		expect(stored).toMatchObject({
			name: "Neu",
			image: "https://img.example/neu.png",
		});
		for (const tenantId of [a.id, b.id]) {
			expect(await mirrorOf(user.id, tenantId)).toMatchObject({
				name: "Neu",
				image: "https://img.example/neu.png",
			});
		}
	});

	test("leaves fields outside the patch alone", async () => {
		await createTenant();
		const user = await createUser({ name: "Max" });

		await updateUserIdentity(user.id, { image: "https://img.example/x.png" });

		expect(await mirrorOf(user.id)).toMatchObject({
			name: "Max",
			email: user.email,
			image: "https://img.example/x.png",
		});
	});

	test("returns null for an unknown identity", async () => {
		await createTenant();
		expect(await updateUserIdentity(randomUUID(), { name: "x" })).toBeNull();
	});
});
