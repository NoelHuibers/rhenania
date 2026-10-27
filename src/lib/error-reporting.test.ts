import { describe, expect, test } from "vitest";

import { errorDigest } from "./error-reporting";

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
