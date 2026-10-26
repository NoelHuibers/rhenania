import { afterEach, describe, expect, test, vi } from "vitest";
import { superAdmins } from "~/server/db/control-schema";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../../test/harness";
import { GET as health } from "./route";

setupTestDatabases();

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

const tenantsRoute = async (env: Record<string, string> = {}) => {
	for (const [k, v] of Object.entries(env)) {
		vi.stubEnv(k, v);
	}
	vi.resetModules();
	return (await import("./tenants/route")).GET;
};

describe("GET /api/health", () => {
	test("is public and reports the expected heads", async () => {
		await createTenant();
		const res = await health();
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			ok: true,
			expected: { tenant: expect.any(String) },
		});
	});
});

describe("GET /api/health/tenants", () => {
	const TOKEN = "a-health-token-of-sufficient-length";

	test("refuses requests without the token or a superadmin session", async () => {
		await createTenant();
		signInAs(await createUser());
		const GET = await tenantsRoute({ HEALTH_TOKEN: TOKEN });

		expect((await GET(new Request("http://x/api/health/tenants"))).status).toBe(
			401,
		);
		const wrong = new Request("http://x/api/health/tenants", {
			headers: { authorization: "Bearer nope" },
		});
		expect((await GET(wrong)).status).toBe(401);
	});

	test("answers with the bearer token", async () => {
		await createTenant({ slug: "a" });
		const GET = await tenantsRoute({ HEALTH_TOKEN: TOKEN });
		const res = await GET(
			new Request("http://x/api/health/tenants", {
				headers: { authorization: `Bearer ${TOKEN}` },
			}),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			healthy: true,
			tenants: [{ slug: "a", ok: true }],
		});
	});

	test("answers for a superadmin session", async () => {
		await createTenant();
		const admin = await createUser();
		await controlDb().insert(superAdmins).values({ userId: admin.id });
		signInAs(admin);
		const GET = await tenantsRoute();
		expect((await GET(new Request("http://x/api/health/tenants"))).status).toBe(
			200,
		);
	});
});
