import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	errorDigest,
	errorName,
	reportBoundaryError,
	reportError,
	stripQuery,
} from "./error-reporting";
import * as tracker from "./error-tracker";

let lines: string[];

beforeEach(() => {
	lines = [];
	vi.spyOn(console, "error").mockImplementation((line: unknown) => {
		lines.push(String(line));
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("errorDigest", () => {
	test("reads Next's digest from a server error", () => {
		expect(errorDigest(Object.assign(new Error("x"), { digest: "abc" }))).toBe(
			"abc",
		);
		expect(errorDigest({ digest: 123 })).toBe("123");
	});

	test("is undefined for client errors and thrown non-errors", () => {
		expect(errorDigest(new Error("x"))).toBeUndefined();
		expect(errorDigest({ digest: "" })).toBeUndefined();
		expect(errorDigest({ digest: null })).toBeUndefined();
		expect(errorDigest("boom")).toBeUndefined();
		expect(errorDigest(null)).toBeUndefined();
		expect(errorDigest(undefined)).toBeUndefined();
	});
});

describe("errorName", () => {
	test("is the class name, never the message", () => {
		expect(errorName(new TypeError("secret"))).toBe("TypeError");
		const nameless = new Error("x");
		nameless.name = "";
		expect(errorName(nameless)).toBe("Error");
		expect(errorName("secret")).toBe("string");
		expect(errorName(undefined)).toBe("undefined");
	});
});

describe("stripQuery", () => {
	test("drops query string and hash", () => {
		expect(stripQuery("/auth/reset?token=abc")).toBe("/auth/reset");
		expect(stripQuery("/a#b")).toBe("/a");
		expect(stripQuery("/plain")).toBe("/plain");
		expect(stripQuery("")).toBe("");
	});
});

describe("reportError", () => {
	test("writes one JSON line without message or stack", () => {
		const error = Object.assign(new Error("mail a@b.de failed"), {
			digest: "d1",
		});

		reportError("request error", error, { source: "request", tenant: "x" });

		expect(lines).toHaveLength(1);
		const line = JSON.parse(lines[0] as string);
		expect(line).toMatchObject({
			level: "error",
			msg: "request error",
			source: "request",
			tenant: "x",
			digest: "d1",
			error: "Error",
		});
		expect(lines[0]).not.toContain("a@b.de");
		expect(lines[0]).not.toContain("at ");
	});

	test("an explicit digest wins over the error's", () => {
		reportError("x", Object.assign(new Error(), { digest: "a" }), {
			source: "request",
			digest: "b",
		});
		expect(JSON.parse(lines[0] as string).digest).toBe("b");
	});

	test("a throwing tracker does not break the caller", () => {
		vi.spyOn(tracker, "captureError").mockImplementation(() => {
			throw new Error("tracker down");
		});

		expect(() =>
			reportError("x", new Error(), { source: "boundary" }),
		).not.toThrow();
		expect(lines).toHaveLength(1);
	});

	test("the hook is a no-op until a tracker is plugged in", () => {
		expect(
			tracker.captureError(new Error(), { source: "request" }),
		).toBeUndefined();
	});
});

describe("reportBoundaryError", () => {
	test("logs the boundary, tenant, path without query, and digest", () => {
		const capture = vi.spyOn(tracker, "captureError");
		const error = Object.assign(new Error("secret"), { digest: "42" });

		reportBoundaryError(error, {
			boundary: "protected",
			tenant: "hassia",
			path: "/rechnungen?token=t",
		});

		const line = JSON.parse(lines[0] as string);
		expect(line).toMatchObject({
			msg: "error boundary",
			source: "boundary",
			boundary: "protected",
			tenant: "hassia",
			route: "/rechnungen",
			digest: "42",
		});
		expect(line).not.toHaveProperty("path");
		expect(line).not.toHaveProperty("global");
		expect(capture).toHaveBeenCalledWith(
			error,
			expect.objectContaining({ source: "boundary", boundary: "protected" }),
		);
	});

	test("marks the root boundary as global", () => {
		reportBoundaryError(new Error(), { boundary: "global", global: true });

		const line = JSON.parse(lines[0] as string);
		expect(line.source).toBe("global-boundary");
		expect(line.route).toBeUndefined();
	});
});
