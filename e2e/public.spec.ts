import { expect, test } from "@playwright/test";

import { HASSIA, RHENANIA } from "./support";

test.describe("public pages per tenant", () => {
	test("Rhenania landing page is served on localhost", async ({ page }) => {
		await page.goto(RHENANIA);
		await expect(page).toHaveTitle(/Rhenania/);
	});

	test("Hassia is resolved from its own host", async ({ page }) => {
		await page.goto(HASSIA);
		await expect(page).toHaveTitle("Corps Hassia (lokal)");
	});

	test("unknown hosts get the tenant-not-found page", async ({ page }) => {
		const res = await page.goto("http://unknown.localhost:3000/");
		expect(res?.status()).toBe(404);
		await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
	});

	test("sign-in page renders the email form @mobile", async ({ page }) => {
		await page.goto("/auth/signin");
		await expect(page.locator("#email")).toBeVisible();
		await expect(page.locator("#password")).toBeVisible();
	});

	test("health endpoint answers without a session", async ({ request }) => {
		const res = await request.get(`${RHENANIA}/api/health`);
		expect(res.status()).toBe(200);
		expect(await res.json()).toMatchObject({ ok: true });
	});

	test("security headers are set", async ({ request }) => {
		const res = await request.get(`${RHENANIA}/auth/signin`);
		const h = res.headers();
		expect(h["x-frame-options"]).toBe("DENY");
		expect(h["x-content-type-options"]).toBe("nosniff");
		expect(h["strict-transport-security"]).toContain("max-age=");
		expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
		expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
		expect(h["content-security-policy-report-only"]).toContain(
			"default-src 'self'",
		);
	});
});
