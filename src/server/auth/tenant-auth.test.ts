// One Better Auth instance per tenant, resolved per request from the cached
// tenant config (#27): host → instance/provider, unknown hosts, and how fast
// a new domain or a rotated Entra app is picked up without a redeploy.

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
	tenantAuthConfig,
	tenantDomains,
	tenants,
} from "~/server/db/control-schema";
import {
	bumpTenantConfigVersion,
	commitTenantConfigChange,
	TENANT_CONFIG_REVALIDATE_MS,
} from "~/server/lib/tenant-config";
import { addDomain, setAuthConfig } from "../../../test/factories/platform";
import {
	controlDb,
	countQueries,
	createTenant,
	createUser,
	setupTestDatabases,
} from "../../../test/harness";
import { testState } from "../../../test/state";

vi.unmock("~/server/auth");

setupTestDatabases();

afterEach(async () => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	(await import("./index")).clearAuthInstances();
});

const authModule = () => import("./index");
const route = () => import("~/app/api/auth/[...all]/route");

const localOrigin = (slug: string) => `http://${slug}.test.localhost:3000`;

async function corps(slug: string, clientId: string | null) {
	const tenant = await createTenant({ slug });
	if (clientId) {
		await setAuthConfig(tenant.id, {
			microsoftEnabled: true,
			azureClientId: clientId,
			azureClientSecret: "secret",
			azureTenantId: `azure-${slug}`,
		});
	}
	return tenant;
}

/** POST /api/auth/sign-in/oauth2 through the real route on `origin`. */
async function startSignIn(
	origin: string,
	providerId: string,
	callbackURL = "/",
) {
	const { POST } = await route();
	return POST(
		new Request(`${origin}/api/auth/sign-in/oauth2`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin,
				host: new URL(origin).host,
			},
			body: JSON.stringify({ providerId, callbackURL }),
		}),
	);
}

/** Entra authorize URL a successful sign-in start redirects to. */
async function authorizeUrl(res: Response): Promise<URL> {
	expect(res.status).toBe(200);
	return new URL(((await res.json()) as { url: string }).url);
}

describe("host → Better Auth instance", () => {
	test("each Corps' host gets its own provider, with redirects on that host", async () => {
		await corps("corps-a", "client-a");
		await corps("corps-b", "client-b");

		const a = await authorizeUrl(
			await startSignIn(localOrigin("corps-a"), "microsoft-corps-a"),
		);
		expect(a.origin + a.pathname).toBe(
			"https://login.microsoftonline.com/azure-corps-a/oauth2/v2.0/authorize",
		);
		expect(a.searchParams.get("client_id")).toBe("client-a");
		expect(a.searchParams.get("redirect_uri")).toBe(
			`${localOrigin("corps-a")}/api/auth/oauth2/callback/microsoft-corps-a`,
		);

		const b = await authorizeUrl(
			await startSignIn(localOrigin("corps-b"), "microsoft-corps-b"),
		);
		expect(b.searchParams.get("client_id")).toBe("client-b");
	});

	test("another Corps' provider and a Corps without Microsoft are refused (403)", async () => {
		await corps("corps-a", "client-a");
		await corps("corps-b", null);

		expect(
			(await startSignIn(localOrigin("corps-b"), "microsoft-corps-a")).status,
		).toBe(403);
		expect(
			(await startSignIn(localOrigin("corps-b"), "microsoft-corps-b")).status,
		).toBe(403);
	});

	test("instances are per tenant and reused while their settings are unchanged", async () => {
		const a = await corps("corps-a", "client-a");
		const b = await corps("corps-b", "client-b");
		const { getAuthForTenant, getAuthForRequest } = await authModule();

		const first = await getAuthForTenant(a.id);
		expect(first).not.toBeNull();
		expect(await getAuthForTenant(a.id)).toBe(first);
		expect(await getAuthForTenant(b.id)).not.toBe(first);
		expect(
			await getAuthForRequest(
				new Headers({ host: "CORPS-A.test.localhost:3000" }),
			),
		).toBe(first);
		// The proxy's public host wins over the internal one.
		expect(
			await getAuthForRequest(
				new Headers({
					host: "internal:8080",
					"x-forwarded-host": "corps-a.test.localhost",
				}),
			),
		).toBe(first);

		// A config change that doesn't touch auth keeps the instance.
		await commitTenantConfigChange(a.id, [
			controlDb()
				.update(tenants)
				.set({ displayName: "Neu" })
				.where(eq(tenants.id, a.id)),
		]);
		expect(await getAuthForTenant(a.id)).toBe(first);
	});

	test("unknown hosts and suspended Corps get no instance; the route answers 404", async () => {
		const gone = await corps("gone", "client-gone");
		await controlDb()
			.update(tenants)
			.set({ status: "suspended" })
			.where(eq(tenants.id, gone.id));
		const { getAuthForTenant, getAuthForRequest } = await authModule();

		expect(
			await getAuthForRequest(new Headers({ host: "evil.example" })),
		).toBeNull();
		expect(await getAuthForRequest(new Headers())).toBeNull();
		expect(await getAuthForTenant(gone.id)).toBeNull();
		expect(await getAuthForTenant("no-such-tenant")).toBeNull();

		expect(
			(await startSignIn("https://evil.example", "microsoft-gone")).status,
		).toBe(404);
		expect(
			(await startSignIn(localOrigin("gone"), "microsoft-gone")).status,
		).toBe(404);
		const { GET } = await route();
		expect(
			(
				await GET(
					new Request("https://evil.example/api/auth/get-session", {
						headers: { host: "evil.example" },
					}),
				)
			).status,
		).toBe(404);
	});

	// Better Auth skips its origin/callback check under NODE_ENV=test, so the
	// list it would check against is asserted directly.
	test("only the Corps' own domains (and BETTER_AUTH_URL) are trusted origins", async () => {
		const a = await corps("corps-a", "client-a");
		await corps("corps-b", "client-b");
		await addDomain(a.id, "corps-a.example");
		const { getAuthForTenant } = await authModule();
		const ctx = await (await getAuthForTenant(a.id))?.$context;
		const trusted = (url: string) => ctx?.isTrustedOrigin(url);

		expect(trusted(`${localOrigin("corps-a")}/profile`)).toBe(true);
		expect(trusted("https://corps-a.example/profile")).toBe(true);
		expect(trusted(`${process.env.BETTER_AUTH_URL}/profile`)).toBe(true);
		expect(trusted(`${localOrigin("corps-b")}/profile`)).toBe(false);
		expect(trusted("https://evil.example/")).toBe(false);
	});
});

describe("config changes without a redeploy", () => {
	test("a rotated Entra app applies on the next request of this instance", async () => {
		const a = await corps("corps-a", "client-a");
		const { getAuthForTenant } = await authModule();
		const before = await getAuthForTenant(a.id);

		// What updateTenantAuthConfigAction does.
		await commitTenantConfigChange(a.id, [
			controlDb()
				.update(tenantAuthConfig)
				.set({ azureClientId: "client-a2", azureClientSecret: "rotated" })
				.where(eq(tenantAuthConfig.tenantId, a.id)),
		]);

		expect(await getAuthForTenant(a.id)).not.toBe(before);
		const url = await authorizeUrl(
			await startSignIn(localOrigin("corps-a"), "microsoft-corps-a"),
		);
		expect(url.searchParams.get("client_id")).toBe("client-a2");
	});

	test("other instances pick up a rotation after one revalidation interval", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		const t0 = new Date("2026-10-27T12:00:00Z").getTime();
		vi.setSystemTime(t0);
		const a = await corps("corps-a", "client-a");
		const clientId = async () =>
			(
				await authorizeUrl(
					await startSignIn(localOrigin("corps-a"), "microsoft-corps-a"),
				)
			).searchParams.get("client_id");
		expect(await clientId()).toBe("client-a");

		// Written by another instance: the version bump reaches the control
		// DB, but this instance's cache is not told.
		await controlDb()
			.update(tenantAuthConfig)
			.set({ azureClientId: "client-a2" })
			.where(eq(tenantAuthConfig.tenantId, a.id));
		await bumpTenantConfigVersion(a.id);

		vi.setSystemTime(t0 + TENANT_CONFIG_REVALIDATE_MS - 1);
		expect(await clientId()).toBe("client-a");
		vi.setSystemTime(t0 + TENANT_CONFIG_REVALIDATE_MS);
		expect(await clientId()).toBe("client-a2");
	});

	test("enabling Microsoft for a Corps registers its provider", async () => {
		const a = await corps("corps-a", null);
		expect(
			(await startSignIn(localOrigin("corps-a"), "microsoft-corps-a")).status,
		).toBe(403);

		await commitTenantConfigChange(a.id, [
			controlDb().insert(tenantAuthConfig).values({
				tenantId: a.id,
				microsoftEnabled: true,
				azureClientId: "client-a",
				azureClientSecret: "secret",
				azureTenantId: "azure-corps-a",
			}),
		]);

		expect(
			(await startSignIn(localOrigin("corps-a"), "microsoft-corps-a")).status,
		).toBe(200);
	});

	test("a new domain works, with redirects and trusted origin on that domain", async () => {
		const a = await corps("corps-a", "client-a");
		expect(
			(await startSignIn("https://corps-a.example", "microsoft-corps-a"))
				.status,
		).toBe(404);

		// What addTenantDomainAction does.
		await commitTenantConfigChange(a.id, [
			controlDb()
				.insert(tenantDomains)
				.values({ tenantId: a.id, hostname: "corps-a.example" }),
		]);

		const url = await authorizeUrl(
			await startSignIn(
				"https://corps-a.example",
				"microsoft-corps-a",
				"https://corps-a.example/profile",
			),
		);
		expect(url.searchParams.get("redirect_uri")).toBe(
			"https://corps-a.example/api/auth/oauth2/callback/microsoft-corps-a",
		);
	});
});

describe("sessions (real Better Auth)", () => {
	async function signInWithPassword(tenantId: string, email: string) {
		const { getAuthForTenant } = await authModule();
		const tenantAuth = await getAuthForTenant(tenantId);
		if (!tenantAuth) {
			throw new Error("no auth");
		}
		const ctx = await tenantAuth.$context;
		const [user] = await ctx.internalAdapter.listUsers(1, 0, undefined, [
			{ field: "email", value: email },
		]);
		if (!user) {
			throw new Error("no user");
		}
		await ctx.internalAdapter.linkAccount({
			userId: user.id,
			providerId: "credential",
			accountId: user.id,
			password: await ctx.password.hash("correct horse battery"),
		});
		const { POST } = await route();
		const res = await POST(
			new Request(`${localOrigin("corps-a")}/api/auth/sign-in/email`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: localOrigin("corps-a"),
					host: "corps-a.test.localhost:3000",
				},
				body: JSON.stringify({ email, password: "correct horse battery" }),
			}),
		);
		expect(res.status).toBe(200);
		return res.headers
			.getSetCookie()
			.map((c) => c.split(";")[0])
			.join("; ");
	}

	test("a session from one Corps is read on another Corps' host; membership still fences", async () => {
		const a = await corps("corps-a", null);
		const b = await corps("corps-b", null);
		const user = await createUser({
			email: "member@a.test",
			roles: ["Admin"],
			tenantId: a.id,
		});
		testState.headers = { cookie: await signInWithPassword(a.id, user.email) };
		const { getRequestContext } = await authModule();

		testState.tenantId = a.id;
		expect((await getRequestContext()).member).toMatchObject({
			id: user.id,
			roles: ["Admin"],
		});

		testState.tenantId = b.id;
		const onB = await getRequestContext();
		expect(onB.identity?.user.id).toBe(user.id);
		expect(onB.member).toBeNull();
	});

	test("a warm request reads only session + user (control) and roles (tenant)", async () => {
		const a = await corps("corps-a", null);
		const user = await createUser({ email: "m@a.test", tenantId: a.id });
		testState.headers = { cookie: await signInWithPassword(a.id, user.email) };
		const { getRequestContext } = await authModule();
		await getRequestContext(); // warms tenant config and membership

		const { result, control, tenant, log } = await countQueries(() =>
			getRequestContext(),
		);

		expect(result.member?.id).toBe(user.id);
		// Better Auth's session lookup is two reads (session, then user);
		// membership and tenant config come from the per-instance caches.
		expect(log.filter((e) => e.db === "control").flatMap((e) => e.sql)).toEqual(
			[
				expect.stringMatching(/from "control_session"/i),
				expect.stringMatching(/from "control_user"/i),
			],
		);
		expect({ control, tenant }).toEqual({ control: 2, tenant: 1 });
	});
});
