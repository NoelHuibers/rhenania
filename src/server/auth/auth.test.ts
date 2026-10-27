// The real auth()/getIdentity() (the rest of the suite uses a test double).
// auth() is the membership fence for every server action, so its contract is
// tested here against the real module: null unless the caller is an ACTIVE
// member of the request's tenant, roles of that tenant only.

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { tenants } from "~/server/db/control-schema";
import { clearTenantHostCache } from "~/server/lib/tenant-context";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	switchTenant,
} from "../../../test/harness";
import { requireControl, testState } from "../../../test/state";

vi.unmock("~/server/auth");

setupTestDatabases();

async function realAuth() {
	const mod = await import("./index");
	vi.spyOn(mod.betterAuthInstance.api, "getSession").mockImplementation(
		(async () => {
			const user = testState.sessionUser;
			return user ? { user, session: { id: "s", userId: user.id } } : null;
		}) as never,
	);
	return mod;
}

afterEach(() => {
	vi.restoreAllMocks();
});

async function setTenantStatus(id: string, status: "active" | "suspended") {
	await requireControl()
		.db.update(tenants)
		.set({ status })
		.where(eq(tenants.id, id));
	clearTenantHostCache();
}

describe("auth() (real)", () => {
	test("returns the member with the roles of the request tenant", async () => {
		await createTenant();
		const user = await createUser({ roles: ["Getränkewart"] });
		signInAs(user);
		const { auth } = await realAuth();

		expect(await auth()).toEqual({
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				image: null,
				roles: ["Getränkewart"],
			},
		});
	});

	test("is null on another Corps' host, even with roles there", async () => {
		const home = await createTenant();
		const other = await createTenant();
		signInAs(await createUser({ roles: ["Admin"], tenantId: home.id }));
		switchTenant(other);
		const { auth, getIdentity } = await realAuth();

		expect(await auth()).toBeNull();
		// The identity itself still exists (superadmin / access-denied use it).
		expect(await getIdentity()).not.toBeNull();
	});

	test("is null on a host without an active tenant", async () => {
		const tenant = await createTenant();
		signInAs(await createUser({ roles: ["Admin"] }));
		const { auth, getIdentity } = await realAuth();

		testState.tenantId = null;
		testState.headers = { host: "unknown.example" };
		expect(await auth()).toBeNull();
		expect(await getIdentity()).not.toBeNull();

		await setTenantStatus(tenant.id, "suspended");
		testState.headers = {};
		testState.tenantId = tenant.id;
		expect(await auth()).toBeNull();
	});

	test("is null for suspended members and anonymous callers", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Admin"], membership: "suspended" }));
		const { auth, getIdentity } = await realAuth();
		expect(await auth()).toBeNull();

		testState.sessionUser = null;
		expect(await auth()).toBeNull();
		expect(await getIdentity()).toBeNull();
	});
});
