import { NextRequest } from "next/server";
import { describe, expect, test } from "vitest";

import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../test/harness";
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

	test("responses don't reveal the tenant id", async () => {
		const tenant = await createTenant();
		const res = await middleware(
			request(`${tenant.slug}.test.localhost`, "/TRINKEN"),
		);

		expect(res.headers.get("x-tenant-id")).toBeNull();
	});
});

describe("proxy gates", () => {
	const path = (res: Response) =>
		new URL(res.headers.get("location") ?? "http://x/").pathname;

	test("public pages pass without a session", async () => {
		const tenant = await createTenant();
		const res = await middleware(
			request(`${tenant.slug}.test.localhost`, "/impressum"),
		);
		expect(res.headers.get("location")).toBeNull();
	});

	test("protected pages send anonymous visitors to sign-in", async () => {
		const tenant = await createTenant();
		const res = await middleware(
			request(`${tenant.slug}.test.localhost`, "/trinken"),
		);
		expect(path(res)).toBe("/auth/signin");
	});

	test("a session of another Corps is sent to access-denied", async () => {
		const home = await createTenant();
		const other = await createTenant();
		signInAs(await createUser({ tenantId: other.id }));
		const res = await middleware(
			request(`${home.slug}.test.localhost`, "/trinken"),
		);
		expect(path(res)).toBe("/access-denied");
	});

	test("role pages require the role, members pass ordinary pages", async () => {
		const tenant = await createTenant();
		signInAs(await createUser());
		const host = `${tenant.slug}.test.localhost`;
		expect(path(await middleware(request(host, "/getraenkewart")))).toBe(
			"/access-denied",
		);
		expect(
			(await middleware(request(host, "/trinken"))).headers.get("location"),
		).toBeNull();
	});

	test("unknown paths redirect to the start page", async () => {
		const tenant = await createTenant();
		const res = await middleware(
			request(`${tenant.slug}.test.localhost`, "/gibt-es-nicht"),
		);
		expect(path(res)).toBe("/");
	});
});
