import { describe, expect, test } from "vitest";

import { isTenantBlobUrl, isTenantReceiptUrl } from "./blob-url";

const STORE = "https://abc123.public.blob.vercel-storage.com";

describe("isTenantReceiptUrl", () => {
	test.each([
		`${STORE}/tenants/rhenania/receipts/1730000000000-beleg.pdf`,
		`${STORE}/tenants/rhenania/receipts/1730000000000-Rechnung%20M%C3%A4rz-x1Y2.jpg`,
		`${STORE}/tenants/rhenania/receipts/a/b.png?download=1`,
	])("accepts %s", (url) => {
		expect(isTenantReceiptUrl(url, "rhenania")).toBe(true);
	});

	test.each([
		["another Corps", `${STORE}/tenants/hassia/receipts/beleg.pdf`],
		["a slug prefix", `${STORE}/tenants/rhenania2/receipts/beleg.pdf`],
		["another folder", `${STORE}/tenants/rhenania/profile/u1/a.png`],
		["the bare folder", `${STORE}/tenants/rhenania/receipts/`],
		[
			"http",
			"http://abc123.public.blob.vercel-storage.com/tenants/rhenania/receipts/a.pdf",
		],
		["a foreign host", "https://evil.example/tenants/rhenania/receipts/a.pdf"],
		[
			"a look-alike host",
			"https://public.blob.vercel-storage.com.evil.example/tenants/rhenania/receipts/a.pdf",
		],
		[
			"the bare blob host",
			"https://public.blob.vercel-storage.com/tenants/rhenania/receipts/a.pdf",
		],
		[
			"credentials",
			"https://u:p@abc123.public.blob.vercel-storage.com/tenants/rhenania/receipts/a.pdf",
		],
		[
			"a port",
			"https://abc123.public.blob.vercel-storage.com:8443/tenants/rhenania/receipts/a.pdf",
		],
		[
			"dot segments",
			`${STORE}/tenants/rhenania/receipts/../../hassia/receipts/a.pdf`,
		],
		[
			"encoded dot segments",
			`${STORE}/tenants/rhenania/receipts/%2e%2e/%2E%2E/hassia/receipts/a.pdf`,
		],
		["a single dot segment", `${STORE}/tenants/rhenania/./receipts/a.pdf`],
		[
			"encoded slashes",
			`${STORE}/tenants/rhenania/receipts%2f..%2fprofile/a.png`,
		],
		["backslashes", `${STORE}/tenants/rhenania/receipts\\..\\x.pdf`],
		["a data URL", "data:application/pdf;base64,AAAA"],
		["a relative path", "/tenants/rhenania/receipts/a.pdf"],
		["garbage", "not a url"],
		["an empty string", ""],
	])("rejects %s", (_label, url) => {
		expect(isTenantReceiptUrl(url, "rhenania")).toBe(false);
	});

	test("rejects everything when the slug is empty", () => {
		expect(isTenantReceiptUrl(`${STORE}/tenants//receipts/a.pdf`, "")).toBe(
			false,
		);
	});
});

describe("isTenantBlobUrl", () => {
	test("checks the given folder", () => {
		const url = `${STORE}/tenants/hassia/profile/user-1/avatar.webp`;
		expect(isTenantBlobUrl(url, "hassia", "profile/user-1/")).toBe(true);
		expect(isTenantBlobUrl(url, "hassia", "profile/user-2/")).toBe(false);
		expect(isTenantBlobUrl(null, "hassia", "profile/user-1/")).toBe(false);
		expect(isTenantBlobUrl(undefined, "hassia", "profile/")).toBe(false);
	});
});
