import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";

import { createTenant, setupTestDatabases } from "../test/harness";
import middleware from "./proxy";

setupTestDatabases();

function request(host: string, path: string) {
	return new NextRequest(new URL(`http://${host}${path}`), {
		headers: { host },
	});
}

describe("proxy lowercase redirect", () => {
	test("page paths are redirected to lowercase", async () => {
		const tenant = await createTenant();
		const res = await middleware(
			request(`${tenant.slug}.test.localhost`, "/TRINKEN"),
		);

		expect(res.status).toBe(301);
		expect(new URL(res.headers.get("location") ?? "").pathname).toBe(
			"/trinken",
		);
	});

	test("API paths keep their case (password-reset tokens)", async () => {
		const tenant = await createTenant();
		const res = await middleware(
			request(
				`${tenant.slug}.test.localhost`,
				"/api/auth/reset-password/TsnNt0W3LDcz",
			),
		);

		expect(res.status).not.toBe(301);
		expect(res.headers.get("location")).toBeNull();
	});

	test("unknown hosts are rewritten to the not-found page", async () => {
		await createTenant();
		const res = await middleware(request("unknown.test.localhost", "/"));

		expect(res.headers.get("x-middleware-rewrite")).toContain(
			"/tenant-not-found",
		);
	});
});
