import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { requireMember } from "~/server/lib/authz";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../test/harness";
import { testState } from "../../../test/state";
import { errorDetails, log, logLine, redact } from "./log";
import { requestIdFrom, requestLogContext } from "./log-context";
import * as tenantContext from "./tenant-context";

// Like Next: one headers object per request (the shared test double builds
// a new one per call), or none at all outside a request.
const request = vi.hoisted(() => ({
	headers: null as Headers | null,
	outside: false,
}));
vi.mock("next/headers", async () => {
	const { testState } = await import("../../../test/state");
	return {
		headers: async () => {
			if (request.outside) {
				throw new Error("`headers` was called outside a request scope");
			}
			request.headers ??= new Headers({
				host:
					(testState.tenantId &&
						testState.tenantHosts.get(testState.tenantId)) ||
					"test.localhost",
				...testState.headers,
			});
			return request.headers;
		},
		cookies: async () => ({ get: () => undefined, getAll: () => [] }),
	};
});

setupTestDatabases();

let lines: Record<string, unknown>[];

beforeEach(() => {
	request.headers = null;
	request.outside = false;
	lines = [];
	const capture = (line: unknown) => {
		lines.push(JSON.parse(String(line)));
	};
	vi.spyOn(console, "error").mockImplementation(capture);
	vi.spyOn(console, "warn").mockImplementation(capture);
	vi.spyOn(console, "info").mockImplementation(capture);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("log", () => {
	test("tags lines with tenant slug, request id and the checked caller", async () => {
		await createTenant({ slug: "hassia" });
		const wart = await createUser({ roles: ["Getränkewart"] });
		signInAs(wart);
		testState.headers = { "x-vercel-id": "fra1::abcde-1700000000000-0123" };

		await requireMember();
		await log.error("billing run failed", {
			err: new Error("boom"),
			periodId: 7,
		});

		expect(lines).toEqual([
			{
				level: "error",
				msg: "billing run failed",
				tenant: "hassia",
				requestId: "fra1::abcde-1700000000000-0123",
				userId: wart.id,
				periodId: 7,
				err: expect.objectContaining({ name: "Error", message: "boom" }),
				time: expect.any(String),
			},
		]);
	});

	test("no user id before a guard ran, explicit fields win", async () => {
		await createTenant({ slug: "hassia" });

		await log.warn("tenant unhealthy", { tenant: "rhenania" });

		expect(lines).toEqual([
			expect.objectContaining({ level: "warn", tenant: "rhenania" }),
		]);
		expect(lines[0]).not.toHaveProperty("userId");
	});

	test("outside a request the line is written without context", async () => {
		request.outside = true;

		await log.info("achievements seeded", { count: 3 });

		expect(lines).toEqual([
			{
				level: "info",
				msg: "achievements seeded",
				count: 3,
				time: expect.any(String),
			},
		]);
	});

	test("a slow tenant lookup does not hold the line back", async () => {
		await createTenant({ slug: "hassia" });
		vi.spyOn(tenantContext, "getTenantById").mockReturnValue(
			new Promise(() => {}),
		);

		expect(await requestLogContext(5)).toEqual({});
	});

	test("never writes secrets or e-mail addresses", async () => {
		logLine("error", "mail failed for a.b@corps.de", {
			to: "x@y.org",
			email: "plain-field@corps.de",
			authToken: "abc",
			nested: { password: "hunter2", note: "Bearer abc.def" },
			err: Object.assign(new Error("send to a.b@corps.de failed"), {
				code: "EAUTH",
			}),
		});

		const [line] = lines;
		expect(line).toMatchObject({
			msg: "mail failed for [email]",
			to: "[email]",
			email: "[redacted]",
			authToken: "[redacted]",
			nested: { password: "[redacted]", note: "Bearer [redacted]" },
			err: { message: "send to [email] failed", code: "EAUTH" },
		});
		expect(JSON.stringify(line)).not.toMatch(/corps\.de|y\.org|hunter2/);
	});
});

describe("redact", () => {
	test.each([
		["user a.b+c@corps-x.de", "user [email]"],
		["Authorization: Bearer abc.def-ghi", "Authorization: Bearer [redacted]"],
		["token eyJhbGciOi.eyJzdWIi.c2ln here", "token [token] here"],
		[
			"libsql://db.turso.io?authToken=secret",
			"libsql://db.turso.io?[redacted]",
		],
		["https://x.de/verify?token=abc&x=1", "https://x.de/verify?[redacted]"],
		["password=hunter2 next", "password=[redacted] next"],
		['{"secret":"s3cr3t"}', '{"secret":"[redacted]"}'],
		["key vercel_blob_rw_ABC123", "key [token]"],
		["IBAN DE89 3704 0044 0532 0130 00 ok", "IBAN [iban] ok"],
		// Package paths in stack frames are not addresses.
		[
			"node_modules/.pnpm/next@16.4.3_react@19.2.0/x.js",
			"node_modules/.pnpm/next@16.4.3_react@19.2.0/x.js",
		],
	])("%s", (input, expected) => {
		expect(redact(input)).toBe(expected);
	});
});

describe("errorDetails", () => {
	test("class, masked message, code, digest, frames and cause", () => {
		const cause = new Error("socket closed for x@y.de");
		const error = Object.assign(new TypeError("bad", { cause }), {
			code: "SQLITE_BUSY",
			digest: "123",
		});

		const details = errorDetails(error);

		expect(details).toMatchObject({
			name: "TypeError",
			message: "bad",
			code: "SQLITE_BUSY",
			digest: "123",
			cause: { name: "Error", message: "socket closed for [email]" },
		});
		expect(details.stack).toEqual(
			expect.arrayContaining([expect.stringMatching(/^at /)]),
		);
		expect((details.stack as string[]).length).toBeLessThanOrEqual(10);
	});

	test("non-errors are described by type", () => {
		expect(errorDetails("x@y.de down")).toEqual({
			name: "string",
			message: "[email] down",
		});
	});
});

describe("requestIdFrom", () => {
	test("prefers Vercel's id and ignores odd values", () => {
		const h = (init: Record<string, string>) => new Headers(init);
		expect(
			requestIdFrom(h({ "x-vercel-id": "fra1::a-1", "x-request-id": "r" })),
		).toBe("fra1::a-1");
		expect(requestIdFrom(h({ "x-request-id": "abc-123" }))).toBe("abc-123");
		expect(requestIdFrom(h({ "x-request-id": "<script>" }))).toBeUndefined();
		expect(requestIdFrom(h({}))).toBeUndefined();
	});
});
