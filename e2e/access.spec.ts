import { expect, test } from "@playwright/test";

import { HASSIA, RHENANIA, signIn, USERS } from "./support";

test.describe("access control", () => {
	test("members are kept out of officer pages", async ({ page }) => {
		await signIn(page, USERS.rhMember);
		for (const path of ["/getraenkewart", "/admin", "/cc-kasse"]) {
			await page.goto(path);
			await expect(page, path).toHaveURL(/\/access-denied/);
		}
	});

	test("the Getränkewart can open the Getränkewart page", async ({ page }) => {
		await signIn(page, USERS.rhWart);
		await page.goto("/getraenkewart");
		await expect(page).toHaveURL(/\/getraenkewart/);
		await expect(page.getByRole("tab", { name: "Kasse" })).toBeVisible();
	});

	test("a session from one Corps grants nothing on another Corps' host", async ({
		page,
	}) => {
		await signIn(page, USERS.rhMember, HASSIA);
		await page.goto(`${HASSIA}/trinken`);
		await expect(page).toHaveURL(/\/access-denied\?required=Mitglied/);
	});

	test("a member of both Corps can use both", async ({ page }) => {
		await signIn(page, USERS.both, RHENANIA);
		await signIn(page, USERS.both, HASSIA);
		await page.goto(`${RHENANIA}/trinken`);
		await expect(page.getByText("Weizen", { exact: true })).toBeVisible();
		await page.goto(`${HASSIA}/trinken`);
		await expect(page.getByText("Cola", { exact: true })).toBeVisible();
	});

	test("superadmin sees every tenant, members do not get in", async ({
		page,
		browser,
	}) => {
		await signIn(page, USERS.rhAdmin);
		await page.goto("/superadmin");
		await expect(page.getByText("Corps Hassia (lokal)").first()).toBeVisible();

		const member = await browser.newPage();
		await signIn(member, USERS.rhMember);
		await member.goto(`${RHENANIA}/superadmin`);
		await expect(member.getByText("Corps Hassia (lokal)")).toHaveCount(0);
		await member.close();
	});
});
