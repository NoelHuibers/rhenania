// Microsoft account linking across Corps (GHSA-6f66-w6m6-cx4x): the unit
// rules, then the real OAuth flow through Better Auth's handler with Entra's
// token endpoint stubbed.

import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import { accounts, tenantMemberships } from "~/server/db/control-schema";
import { clearTenantHostCache } from "~/server/lib/tenant-context";
import { setAuthConfig } from "../../../test/factories/platform";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
} from "../../../test/harness";
import {
	decodeJwtClaims,
	getMicrosoftUserInfo,
	isMemberByEmail,
	requestedProviderId,
} from "./microsoft-linking";

vi.unmock("~/server/auth");

setupTestDatabases();

afterEach(() => {
	vi.restoreAllMocks();
	clearTenantHostCache();
});

function jwt(claims: Record<string, unknown>): string {
	const part = (value: object) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${part({ alg: "none" })}.${part(claims)}.`;
}

// Fixed slugs and Entra tenants, so provider ids and hosts are predictable;
// every test recreates the same two Corps.
const A = { slug: "corps-a", azure: "azure-a" };
const B = { slug: "corps-b", azure: "azure-b" };
const host = (slug: string) => `${slug}.test.localhost`;

async function twoCorps() {
	const a = await createTenant({ slug: A.slug });
	const b = await createTenant({ slug: B.slug });
	for (const [tenant, azure] of [
		[a, A.azure],
		[b, B.azure],
	] as const) {
		await setAuthConfig(tenant.id, {
			microsoftEnabled: true,
			azureClientId: `client-${tenant.slug}`,
			azureClientSecret: "secret",
			azureTenantId: azure,
		});
	}
	return { a, b };
}

const providerB = {
	providerId: `microsoft-${B.slug}`,
	tenantSlug: B.slug,
	azureTenantId: B.azure,
	userInfoUrl: "https://graph.microsoft.com/oidc/userinfo",
};

describe("requestedProviderId", () => {
	test("reads the provider of sign-in, link and callback requests", () => {
		expect(
			requestedProviderId({
				path: "/sign-in/oauth2",
				body: { providerId: "microsoft-x" },
			}),
		).toBe("microsoft-x");
		expect(
			requestedProviderId({
				path: "/oauth2/link",
				body: { providerId: "microsoft-y" },
			}),
		).toBe("microsoft-y");
		expect(
			requestedProviderId({
				path: "/oauth2/callback/:providerId",
				params: { providerId: "microsoft-z" },
			}),
		).toBe("microsoft-z");
	});

	test("is empty for a provider endpoint without a provider, null elsewhere", () => {
		expect(requestedProviderId({ path: "/sign-in/oauth2", body: {} })).toBe("");
		expect(requestedProviderId({ path: "/sign-in/email", body: {} })).toBe(
			null,
		);
		expect(requestedProviderId({})).toBe(null);
	});
});

describe("decodeJwtClaims", () => {
	test("returns the payload, or null for anything that isn't a JWT", () => {
		expect(decodeJwtClaims(jwt({ sub: "1", tid: "t" }))).toEqual({
			sub: "1",
			tid: "t",
		});
		expect(decodeJwtClaims("nope")).toBeNull();
		expect(decodeJwtClaims("a.%%%.c")).toBeNull();
	});
});

describe("getMicrosoftUserInfo", () => {
	test("counts the e-mail as verified only for a member of the provider's Corps", async () => {
		const { a, b } = await twoCorps();
		await createUser({ email: "member@b.test", tenantId: b.id });
		await createUser({ email: "outsider@a.test", tenantId: a.id });
		const login = (email: string) =>
			getMicrosoftUserInfo(
				{ idToken: jwt({ sub: `sub-${email}`, email, tid: B.azure }) },
				providerB,
			);

		expect(await login("Member@B.test")).toEqual({
			id: "sub-Member@B.test",
			email: "member@b.test",
			name: undefined,
			image: undefined,
			emailVerified: true,
		});
		expect((await login("outsider@a.test"))?.emailVerified).toBe(false);
		expect((await login("new@b.test"))?.emailVerified).toBe(false);
	});

	test("counts a suspended or pending membership (auth() still fences access)", async () => {
		const { b } = await twoCorps();
		await createUser({
			email: "pending@b.test",
			tenantId: b.id,
			membership: "pending",
		});
		expect(await isMemberByEmail("pending@b.test", B.slug)).toBe(true);
		expect(await isMemberByEmail("pending@b.test", A.slug)).toBe(false);
	});

	test("refuses an ID token issued by another Entra tenant", async () => {
		await twoCorps();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(
			await getMicrosoftUserInfo(
				{ idToken: jwt({ sub: "s", email: "x@b.test", tid: A.azure }) },
				providerB,
			),
		).toBeNull();
		expect(
			await getMicrosoftUserInfo(
				{ idToken: jwt({ sub: "s", email: "x@b.test" }) },
				providerB,
			),
		).toBeNull();
		expect(warn).toHaveBeenCalledTimes(2);
	});

	test("falls back to the userinfo endpoint when the ID token has no e-mail", async () => {
		await twoCorps();
		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({
				sub: "graph-sub",
				email: "Graph@B.test",
				name: "Graph User",
				picture: "https://example.test/p.png",
			}),
		);

		const info = await getMicrosoftUserInfo(
			{
				accessToken: "at",
				idToken: jwt({ sub: "graph-sub", tid: B.azure }),
			},
			providerB,
		);

		expect(fetchSpy).toHaveBeenCalledWith(providerB.userInfoUrl, {
			headers: { Authorization: "Bearer at" },
		});
		expect(info).toEqual({
			id: "graph-sub",
			email: "graph@b.test",
			name: "Graph User",
			image: "https://example.test/p.png",
			emailVerified: false,
		});
	});

	test("returns null without a subject or when userinfo fails", async () => {
		await twoCorps();
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("no", { status: 401 }),
		);
		expect(await getMicrosoftUserInfo({ accessToken: "at" }, providerB)).toBe(
			null,
		);
		expect(await getMicrosoftUserInfo({}, providerB)).toBeNull();
	});
});

// ─── The real flow ──────────────────────────────────────────────────────────

/** The real `/api/auth/[...all]` route: picks the host's Better Auth instance. */
const authRoute = async (request: Request) =>
	(await import("~/app/api/auth/[...all]/route")).POST(request);

function cookieHeader(res: Response): string {
	return res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
}

async function startSignIn(slug: string, providerId: string) {
	const origin = `http://${host(slug)}:3000`;
	return authRoute(
		new Request(`${origin}/api/auth/sign-in/oauth2`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin,
				host: `${host(slug)}:3000`,
			},
			body: JSON.stringify({
				providerId,
				callbackURL: "/",
				errorCallbackURL: "/auth/signin",
			}),
		}),
	);
}

/** Signs in on `slug`'s host with `providerId`; Entra answers with `claims`. */
async function microsoftLogin(
	slug: string,
	providerId: string,
	claims: Record<string, unknown>,
) {
	const start = await startSignIn(slug, providerId);
	expect(start.status).toBe(200);
	const { url } = (await start.json()) as { url: string };
	const state = new URL(url).searchParams.get("state");

	vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
		Response.json({
			access_token: "access",
			id_token: jwt(claims),
			token_type: "Bearer",
			expires_in: 3600,
		}),
	);
	const origin = `http://${host(slug)}:3000`;
	return authRoute(
		new Request(
			`${origin}/api/auth/oauth2/callback/${providerId}?code=code&state=${state}`,
			{ headers: { cookie: cookieHeader(start), host: `${host(slug)}:3000` } },
		),
	);
}

const accountsOf = (userId: string) =>
	controlDb().select().from(accounts).where(eq(accounts.userId, userId));

describe("Microsoft login across Corps (real Better Auth)", () => {
	test("another Corps' Entra user with a member's e-mail is not linked", async () => {
		const { a } = await twoCorps();
		const victim = await createUser({
			email: "victim@a.test",
			tenantId: a.id,
		});

		const res = await microsoftLogin(B.slug, `microsoft-${B.slug}`, {
			sub: "attacker",
			email: "victim@a.test",
			name: "Attacker",
			tid: B.azure,
		});

		expect(res.status).toBe(302);
		const location = new URL(res.headers.get("location") ?? "", "http://x");
		expect(location.pathname).toBe("/auth/signin");
		expect(location.searchParams.get("error")).toBe("account_not_linked");
		expect(cookieHeader(res)).not.toMatch(/session_token=[^;]+/);
		expect(await accountsOf(victim.id)).toEqual([]);
		const memberships = await controlDb()
			.select({ tenantId: tenantMemberships.tenantId })
			.from(tenantMemberships)
			.where(eq(tenantMemberships.userId, victim.id));
		expect(memberships).toEqual([{ tenantId: a.id }]);
	});

	test("a member of the provider's Corps is linked and signed in", async () => {
		const { b } = await twoCorps();
		const member = await createUser({ email: "member@b.test", tenantId: b.id });

		const res = await microsoftLogin(B.slug, `microsoft-${B.slug}`, {
			sub: "member-sub",
			email: "member@b.test",
			name: "Member",
			tid: B.azure,
		});

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toBe("/");
		expect(cookieHeader(res)).toMatch(/session_token=[^;]+/);
		expect(await accountsOf(member.id)).toMatchObject([
			{ providerId: `microsoft-${B.slug}`, accountId: "member-sub" },
		]);
	});

	test("a token from another Entra tenant is refused", async () => {
		const { b } = await twoCorps();
		const member = await createUser({ email: "member@b.test", tenantId: b.id });
		vi.spyOn(console, "warn").mockImplementation(() => {});

		const res = await microsoftLogin(B.slug, `microsoft-${B.slug}`, {
			sub: "member-sub",
			email: "member@b.test",
			name: "Member",
			tid: A.azure,
		});

		expect(res.status).toBe(302);
		expect(res.headers.get("location")).toContain("error=");
		expect(await accountsOf(member.id)).toEqual([]);
	});

	test("another Corps' provider is refused on this Corps' host (403)", async () => {
		await twoCorps();
		vi.spyOn(console, "error").mockImplementation(() => {});

		const start = await startSignIn(A.slug, `microsoft-${B.slug}`);
		expect(start.status).toBe(403);

		const callback = await authRoute(
			new Request(
				`http://${host(A.slug)}:3000/api/auth/oauth2/callback/microsoft-${B.slug}?code=c&state=s`,
				{ headers: { host: `${host(A.slug)}:3000` } },
			),
		);
		expect(callback.status).toBe(403);

		const unknown = await startSignIn(A.slug, "microsoft-nope");
		expect(unknown.status).toBe(403);
	});

	test("explicit linking is held to the same host check", async () => {
		await twoCorps();
		const res = await authRoute(
			new Request(`http://${host(A.slug)}:3000/api/auth/oauth2/link`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: `http://${host(A.slug)}:3000`,
					host: `${host(A.slug)}:3000`,
				},
				body: JSON.stringify({
					providerId: `microsoft-${B.slug}`,
					callbackURL: "/",
				}),
			}),
		);
		expect(res.status).toBe(403);
	});
});
