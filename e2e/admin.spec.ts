import { expect, test } from "@playwright/test";

import { signIn, USERS } from "./support";

test("admin sees the member list", async ({ page }) => {
	await signIn(page, USERS.rhAdmin);
	await page.goto("/admin");
	await expect(page.getByText("Max Mitglied").first()).toBeVisible();
	await expect(page.getByText("Gustav Getränkewart").first()).toBeVisible();
});
