import { expect, test } from "@playwright/test";

import { drinkCard, HASSIA, orderDrink, signIn, USERS } from "./support";

test.describe("ordering drinks", () => {
	test("a member orders a Pils @mobile", async ({ page }) => {
		await signIn(page, USERS.rhMember);
		const toast = await orderDrink(page, "Pils");
		expect(toast).toMatch(/1,20\s€/);
		expect(toast).toContain("eigene Kosten");
	});

	test("unavailable drinks cannot be ordered", async ({ page }) => {
		await signIn(page, USERS.rhMember);
		await page.goto("/trinken");
		const radler = drinkCard(page, "Radler");
		await expect(radler).toBeVisible();
		await expect(radler.getByRole("button")).toBeDisabled();
	});

	test("Hassia's markup is applied to personal orders", async ({ page }) => {
		await signIn(page, USERS.haMember, HASSIA);
		const toast = await orderDrink(page, "Pils", HASSIA);
		// 1.30 € purchase price + 10 % markup
		expect(toast).toMatch(/1,43\s€/);
	});
});
