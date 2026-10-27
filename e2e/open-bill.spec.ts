// An open bill and its Bezahlen button are visible without scrolling on a
// phone, on /trinken and on the profile, and paying is two taps away (#80).

import { type Browser, expect, type Page, test } from "@playwright/test";

import { orderDrink, signIn, USERS } from "./support";

/** The member orders a drink and the Getränkewart bills it. */
async function billTheMember(browser: Browser) {
	const member = await browser.newPage();
	await signIn(member, USERS.rhMember);
	await orderDrink(member, "Weizen");
	await member.close();

	const wart = await browser.newPage();
	await signIn(wart, USERS.rhWart);
	await wart.goto("/getraenkewart?tab=kasse", { waitUntil: "networkidle" });
	const confirm = wart.getByRole("button", { name: "Ja, erstellen" });
	await expect(async () => {
		await wart.getByRole("button", { name: "Erstellen" }).click();
		await expect(confirm).toBeVisible({ timeout: 2_000 });
	}).toPass({ timeout: 20_000 });
	await confirm.click();
	await expect(
		wart.getByText("Neue Rechnung erfolgreich erstellt"),
	).toBeVisible({ timeout: 30_000 });
	await wart.close();
}

/** Asserts the element is fully inside the viewport (no scrolling needed). */
async function expectAboveTheFold(page: Page, name: RegExp | string) {
	const region = page.getByRole("region", { name: "Offene Getränkerechnung" });
	const target = region.getByRole("button", { name });
	await expect(target).toBeVisible();
	const box = await target.boundingBox();
	const viewport = page.viewportSize();
	expect(box && viewport).toBeTruthy();
	expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
		viewport?.height ?? 0,
	);
	return { region, target };
}

test.describe("open bill (#80)", () => {
	test("Bezahlen is above the fold on /trinken and the profile, IBAN two taps away @mobile", async ({
		browser,
		page,
		isMobile,
	}) => {
		// On desktop the profile's BillingOverview heads the right column
		// instead; this checks the phone layout.
		test.skip(!isMobile, "phone layout only");
		await billTheMember(browser);
		await signIn(page, USERS.rhMember);

		for (const url of ["/trinken", "/profile"]) {
			await page.goto(url, { waitUntil: "networkidle" });
			const { region } = await expectAboveTheFold(page, "Bezahlen");
			await expect(region).toContainText(/\d+,\d{2}\s€/);
		}

		// Tap 1: Bezahlen (on the profile, where we are now).
		const { target } = await expectAboveTheFold(page, "Bezahlen");
		const copyIban = page.getByRole("button", { name: "IBAN kopieren" });
		await expect(async () => {
			await (isMobile ? target.tap() : target.click());
			await expect(copyIban).toBeVisible({ timeout: 2_000 });
		}).toPass({ timeout: 20_000 });
		// Tap 2 would copy the IBAN; the seeded account is shown in the sheet.
		await expect(page.getByText("DE89 3704 0044 0532 0130 00")).toBeVisible();
	});
});
