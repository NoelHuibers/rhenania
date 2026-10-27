import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { onRequestError } from "~/instrumentation";
import * as reporting from "~/lib/error-reporting";
import * as tracker from "~/lib/error-tracker";
import { createTenant, setupTestDatabases } from "../../../test/harness";
import { tenantSlugForRequest } from "./request-error-log";
import * as tenantContext from "./tenant-context";

setupTestDatabases();

type Ctx = Parameters<typeof onRequestError>[2];

const context: Ctx = {
	routerKind: "App Router",
	routePath: "/(protected)/rechnungen",
	routeType: "render",
	renderSource: "react-server-components",
	revalidateReason: undefined,
};

function serverError(message: string, digest = "1234567890") {
	return Object.assign(new Error(message), { digest });
}

let lines: string[];

beforeEach(() => {
	lines = [];
	vi.spyOn(console, "error").mockImplementation((line: unknown) => {
		lines.push(String(line));
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

function onlyLine(): Record<string, unknown> {
	expect(lines).toHaveLength(1);
	return JSON.parse(lines[0] as string);
}

describe("onRequestError", () => {
	test("logs one JSON line with tenant slug, route and digest", async () => {
		const tenant = await createTenant({ slug: "hassia" });

		await onRequestError(
			serverError("UNIQUE constraint failed: users.email = a@b.de", "4242"),
			{
				path: "/rechnungen?token=secret",
				method: "GET",
				headers: { host: "other.example", "x-tenant-id": tenant.id },
			},
			context,
		);

		const line = onlyLine();
		expect(line).toMatchObject({
			level: "error",
			msg: "request error",
			source: "request",
			tenant: "hassia",
			route: "/(protected)/rechnungen",
			path: "/rechnungen",
			method: "GET",
			routeType: "render",
			digest: "4242",
			error: "Error",
		});
		expect(typeof line.time).toBe("string");
		// Neither the message (personal data) nor the query (tokens) is logged.
		expect(lines[0]).not.toContain("a@b.de");
		expect(lines[0]).not.toContain("secret");
		expect(lines[0]).not.toContain("UNIQUE");
	});

	test("falls back to the host when the proxy did not stamp the tenant", async () => {
		await createTenant({ slug: "rhenania" });

		await onRequestError(
			serverError("boom"),
			{
				path: "/",
				method: "POST",
				headers: { host: "rhenania.test.localhost:3000" },
			},
			{ ...context, routePath: "/proxy", routeType: "proxy" },
		);

		expect(onlyLine()).toMatchObject({
			tenant: "rhenania",
			route: "/proxy",
			routeType: "proxy",
			method: "POST",
		});
	});

	test("prefers x-forwarded-host and takes the first of repeated headers", async () => {
		await createTenant({ slug: "hassia" });

		await onRequestError(
			serverError("boom"),
			{
				path: "/",
				method: "GET",
				headers: {
					host: "internal.vercel.app",
					"x-forwarded-host": ["hassia.test.localhost", "ignored"],
				},
			},
			context,
		);

		expect(onlyLine().tenant).toBe("hassia");
	});

	test("logs tenant null for an unknown host", async () => {
		await onRequestError(
			"a thrown string",
			{ path: "/x", method: "GET", headers: { host: "nobody.example" } },
			context,
		);

		const line = onlyLine();
		expect(line.tenant).toBeNull();
		expect(line.error).toBe("string");
		expect(line.digest).toBeUndefined();
	});

	test("logs tenant null for a stamped id that no longer exists", async () => {
		await onRequestError(
			serverError("boom"),
			{ path: "/x", method: "GET", headers: { "x-tenant-id": "gone" } },
			context,
		);

		expect(onlyLine().tenant).toBeNull();
	});

	test("still logs when the tenant lookup fails", async () => {
		vi.spyOn(tenantContext, "getTenantById").mockRejectedValue(
			new Error("control DB down"),
		);

		await onRequestError(
			serverError("boom", "99"),
			{ path: "/x", method: "GET", headers: { "x-tenant-id": "t1" } },
			context,
		);

		expect(onlyLine()).toMatchObject({ tenant: null, digest: "99" });
	});

	test("hands the error to the tracker hook with the same fields", async () => {
		const capture = vi.spyOn(tracker, "captureError");
		const error = serverError("boom", "7");

		await onRequestError(
			error,
			{ path: "/x", method: "GET", headers: {} },
			context,
		);

		expect(capture).toHaveBeenCalledWith(
			error,
			expect.objectContaining({ source: "request", digest: "7" }),
		);
	});

	test("never throws, even if logging itself fails", async () => {
		vi.spyOn(reporting, "reportError").mockImplementation(() => {
			throw new Error("stderr closed");
		});

		await expect(
			onRequestError(
				serverError("boom"),
				{ path: "/x", method: "GET", headers: {} },
				context,
			),
		).resolves.toBeUndefined();
		expect(lines[0]).toBe("onRequestError failed");
	});

	test("skips the Edge runtime, which has no database client", async () => {
		vi.stubEnv("NEXT_RUNTIME", "edge");

		await onRequestError(
			serverError("boom"),
			{ path: "/x", method: "GET", headers: {} },
			context,
		);

		expect(lines).toEqual([]);
	});
});

describe("tenantSlugForRequest", () => {
	test("gives up after the timeout instead of holding the response", async () => {
		vi.spyOn(tenantContext, "getTenantById").mockReturnValue(
			new Promise(() => {}),
		);

		await expect(
			tenantSlugForRequest(
				{ path: "/", method: "GET", headers: { "x-tenant-id": "t1" } },
				5,
			),
		).resolves.toBeNull();
	});
});
