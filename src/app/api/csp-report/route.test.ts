import {
	afterEach,
	beforeEach,
	describe,
	expect,
	type MockInstance,
	test,
	vi,
} from "vitest";

import { createTenant, setupTestDatabases } from "../../../../test/harness";
import { POST } from "./route";

setupTestDatabases();

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
	warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
	warn.mockRestore();
});

function post(body: BodyInit, contentType: string) {
	return POST(
		new Request("http://hassia.test.localhost/api/csp-report", {
			method: "POST",
			headers: { "content-type": contentType },
			body,
		}),
	);
}

/** The JSON lines the route logged. */
function logged(): Record<string, unknown>[] {
	return warn.mock.calls.map((call) => JSON.parse(String(call[0])));
}

describe("POST /api/csp-report (#91)", () => {
	test("logs a legacy report-uri report", async () => {
		await createTenant();
		const res = await post(
			JSON.stringify({
				"csp-report": {
					"document-uri": "https://hassia.example/trinken?token=abc",
					"violated-directive": "script-src-elem",
					"effective-directive": "script-src-elem",
					"blocked-uri": "https://evil.example/x.js",
					disposition: "report",
					"source-file": "https://hassia.example/_next/a.js",
					"line-number": 12,
					"script-sample": "alert(1)",
				},
			}),
			"application/csp-report",
		);

		expect(res.status).toBe(204);
		expect(logged()).toMatchObject([
			{
				level: "warn",
				msg: "csp violation",
				directive: "script-src-elem",
				blocked: "https://evil.example/x.js",
				// Query strings are masked by the logger.
				document: "https://hassia.example/trinken?[redacted]",
				source: "https://hassia.example/_next/a.js",
				line: 12,
				disposition: "report",
			},
		]);
		// Samples may hold page content; they are never logged.
		expect(JSON.stringify(logged())).not.toContain("alert(1)");
	});

	test("logs Reporting API batches, CSP entries only", async () => {
		await createTenant();
		const res = await post(
			JSON.stringify([
				{
					type: "csp-violation",
					url: "https://hassia.example/",
					body: {
						documentURL: "https://hassia.example/",
						effectiveDirective: "img-src",
						blockedURL: "https://cdn.example/a.png",
						disposition: "report",
						lineNumber: 3,
					},
				},
				{ type: "deprecation", body: { id: "x" } },
			]),
			"application/reports+json",
		);

		expect(res.status).toBe(204);
		expect(logged()).toMatchObject([
			{
				directive: "img-src",
				blocked: "https://cdn.example/a.png",
				document: "https://hassia.example/",
				line: 3,
			},
		]);
	});

	test("ignores junk and caps what one request can log", async () => {
		await createTenant();
		expect((await post("not json", "text/plain")).status).toBe(204);
		expect((await post('{"x":1}', "application/json")).status).toBe(204);
		expect(logged()).toEqual([]);

		const many = Array.from({ length: 50 }, () => ({
			type: "csp-violation",
			body: { effectiveDirective: "x".repeat(5000) },
		}));
		await post(JSON.stringify(many).slice(0, 15_000), "application/json");
		expect(logged()).toEqual([]);

		const batch = JSON.stringify(many.slice(0, 2));
		await post(batch, "application/reports+json");
		const lines = logged();
		expect(lines).toHaveLength(2);
		expect(String(lines[0]?.directive).length).toBeLessThanOrEqual(300);
	});

	test("rejects oversized bodies", async () => {
		await createTenant();
		const res = await post("x".repeat(70_000), "application/csp-report");
		expect(res.status).toBe(413);
		// A declared length over the cap is refused before reading.
		const declared = await POST(
			new Request("http://hassia.test.localhost/api/csp-report", {
				method: "POST",
				headers: { "content-length": "100000" },
				body: "{}",
			}),
		);
		expect(declared.status).toBe(413);
		expect(logged()).toEqual([]);
	});

	test("accepts an empty POST and falls back to violated-directive", async () => {
		await createTenant();
		const empty = await POST(
			new Request("http://hassia.test.localhost/api/csp-report", {
				method: "POST",
			}),
		);
		expect(empty.status).toBe(204);

		await post(
			JSON.stringify({ "csp-report": { "violated-directive": "img-src" } }),
			"application/csp-report",
		);
		expect(logged()).toMatchObject([{ directive: "img-src", blocked: null }]);
	});

	test("logs at most 20 reports per request", async () => {
		await createTenant();
		const many = Array.from({ length: 30 }, (_, i) => ({
			type: "csp-violation",
			body: { effectiveDirective: `d${i}` },
		}));
		await post(JSON.stringify(many), "application/reports+json");
		expect(logged()).toHaveLength(20);
	});
});
