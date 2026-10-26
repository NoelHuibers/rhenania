// The real auth()/getIdentity() (the rest of the suite uses a test double).
// auth() is the membership fence for every server action, so its contract is
// tested here against the real module: null unless the caller is an ACTIVE
// member of the request's tenant, roles of that tenant only.

import { afterEach, describe, expect, test, vi } from "vitest";

import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	switchTenant,
} from "../../../test/harness";
import { testState } from "../../../test/state";

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
