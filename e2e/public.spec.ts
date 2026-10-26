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
});
