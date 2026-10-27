// The real auth()/getIdentity() (the rest of the suite uses a test double).
// auth() is the membership fence for every server action, so its contract is
// tested here against the real module: null unless the caller is an ACTIVE
// member of the request's tenant, roles of that tenant only.

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { tenantMemberships, tenants } from "~/server/db/control-schema";
import {
	clearTenantHostCache,
	MEMBERSHIP_CACHE_TTL_MS,
} from "~/server/lib/tenant-context";
import {
	controlDb,
	countQueries,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	switchTenant,
} from "../../../test/harness";
import { requireControl, testState } from "../../../test/state";

vi.unmock("~/server/auth");
vi.mock("~/server/actions/newuser/email", async (importOriginal) => ({
	...(await importOriginal<object>()),
	sendVerificationEmail: vi.fn(),
}));
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));

setupTestDatabases();

/** The real module, with every existing tenant's session lookup stubbed. */
async function realAuth() {
	const mod = await import("./index");
	for (const tenantId of testState.tenants.keys()) {
		const tenantAuth = await mod.getAuthForTenant(tenantId);
		if (!tenantAuth) {
			continue;
		}
		vi.spyOn(tenantAuth.api, "getSession").mockImplementation((async () => {
			const user = testState.sessionUser;
			return user ? { user, session: { id: "s", userId: user.id } } : null;
		}) as never);
	}
	return mod;
}

afterEach(async () => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	(await import("./index")).clearAuthInstances();
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

describe("getRequestContext() (#20)", () => {
	test("bundles tenant, flags, identity and member", async () => {
		const tenant = await createTenant({ features: ["drinks.markup"] });
		const user = await createUser({ roles: ["Admin"] });
		signInAs(user);
		const { getRequestContext } = await realAuth();

		const ctx = await getRequestContext();

		expect(ctx.tenantId).toBe(tenant.id);
		expect(ctx.tenant?.slug).toBe(tenant.slug);
		expect(ctx.tenant?.features["drinks.markup"]).toBe(true);
		expect(ctx.identity?.user.id).toBe(user.id);
		expect(ctx.member).toMatchObject({ id: user.id, roles: ["Admin"] });
	});

	test("has no member for a non-member, and the tenant without a session", async () => {
		const home = await createTenant();
		const other = await createTenant();
		signInAs(await createUser({ tenantId: home.id }));
		switchTenant(other);
		const { getRequestContext } = await realAuth();

		const ctx = await getRequestContext();
		expect(ctx.identity).not.toBeNull();
		expect(ctx.member).toBeNull();

		testState.sessionUser = null;
		expect(await getRequestContext()).toMatchObject({
			tenantId: other.id,
			identity: null,
			member: null,
		});
	});

	test("a host of no tenant has neither identity nor member", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Admin"] }));
		testState.headers = { host: "unknown.example" };
		const { getRequestContext } = await realAuth();

		expect(await getRequestContext()).toEqual({
			tenantId: null,
			tenant: null,
			identity: null,
			member: null,
		});
	});
});

describe("auth() query budget (#20)", () => {
	test("a warm call costs no control-DB query and one tenant query", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Admin"] }));
		const { auth } = await realAuth();
		await auth(); // warms the tenant config and the membership cache

		const { result, control, tenant } = await countQueries(() => auth());

		expect(result?.user.roles).toEqual(["Admin"]);
		// Better Auth's own session lookup is stubbed here; it adds its
		// control-DB read once per request.
		expect({ control, tenant }).toEqual({ control: 0, tenant: 1 });
	});
});

describe("membership revocation (#20)", () => {
	test("removing a member applies at once on this instance", async () => {
		await createTenant();
		const admin = await createUser({ roles: ["Admin"] });
		const member = await createUser();
		const { auth } = await realAuth();
		signInAs(member);
		expect(await auth()).not.toBeNull(); // now cached as active

		signInAs(admin);
		const { deleteUser } = await import("~/server/actions/admin/admin");
		await deleteUser(member.id);

		signInAs(member);
		expect(await auth()).toBeNull();
	});

	test("a suspension written elsewhere applies within the cache TTL", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
		await createTenant();
		const member = await createUser();
		signInAs(member);
		const { auth } = await realAuth();
		expect(await auth()).not.toBeNull();

		await controlDb()
			.update(tenantMemberships)
			.set({ status: "suspended" })
			.where(eq(tenantMemberships.userId, member.id));

		vi.setSystemTime(new Date(Date.now() + MEMBERSHIP_CACHE_TTL_MS - 1_000));
		expect(await auth()).not.toBeNull();
		vi.setSystemTime(new Date(Date.now() + 2_000));
		expect(await auth()).toBeNull();
	});

	test("a membership added by an admin applies at once", async () => {
		await createTenant();
		const admin = await createUser({ roles: ["Admin"] });
		const other = await createTenant();
		const outsider = await createUser({ tenantId: other.id });
		const { auth } = await realAuth();
		signInAs(outsider);
		expect(await auth()).toBeNull(); // now cached as not a member

		signInAs(admin);
		const { createUser: addUser } = await import(
			"~/server/actions/newuser/users"
		);
		expect(
			await addUser({ email: outsider.email, name: "Outsider" }),
		).toMatchObject({ success: true });

		signInAs(outsider);
		expect(await auth()).not.toBeNull();
	});
});
