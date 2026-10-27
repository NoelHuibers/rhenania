import { afterEach, describe, expect, test, vi } from "vitest";
import { superAdmins } from "~/server/db/control-schema";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../../test/harness";
import { requireTenant } from "../../../../test/state";
import { GET as health } from "./route";
import { GET as tenantsHealthRoute } from "./tenants/route";

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
		// Static import: re-importing after vi.resetModules() would give the
		// route a fresh, empty test state.
		const res = await tenantsHealthRoute(
			new Request("http://x/api/health/tenants"),
		);
		expect(res.status).toBe(200);
	});

	test("logs one tenant-tagged line per unhealthy tenant", async () => {
		await createTenant({ slug: "aktuell" });
		const behind = await createTenant({ slug: "zurueck" });
		await requireTenant(behind.id).client.execute(
			"DELETE FROM __drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM __drizzle_migrations)",
		);
		const admin = await createUser();
		await controlDb().insert(superAdmins).values({ userId: admin.id });
		signInAs(admin);
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		const res = await tenantsHealthRoute(
			new Request("http://x/api/health/tenants"),
		);

		expect(res.status).toBe(503);
		const lines = warn.mock.calls.map(([line]) => JSON.parse(String(line)));
		warn.mockRestore();
		expect(lines).toEqual([
			expect.objectContaining({
				level: "warn",
				msg: "tenant unhealthy",
				tenant: "zurueck",
				reachable: true,
				schemaBehind: true,
			}),
		]);
	});

	test("answers for a superadmin who is not a member of this Corps", async () => {
		await createTenant();
		const admin = await createUser({ membership: null });
		await controlDb().insert(superAdmins).values({ userId: admin.id });
		signInAs(admin);
		const res = await tenantsHealthRoute(
			new Request("http://x/api/health/tenants"),
		);
		expect(res.status).toBe(200);
	});
});
