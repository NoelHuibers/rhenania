// The two-tap order on a phone (#74): tap a drink, tap the confirm button.
// Tagged @mobile so it also runs on the Pixel 7 project, with real taps there.

import { expect, type Locator, type Page, test } from "@playwright/test";

import { confirmButton, drinkCard, signIn, USERS } from "./support";

/** A tap on touch devices, a click elsewhere. */
async function tap(locator: Locator, isMobile: boolean) {
	await (isMobile ? locator.tap() : locator.click());
}

/** Loads /trinken and waits until a tap on `name` opens the drawer (hydration). */
async function openDrawerFor(page: Page, name: string, isMobile: boolean) {
	const confirm = confirmButton(page);
	await expect(async () => {
		await tap(drinkCard(page, name), isMobile);
		await expect(confirm).toBeVisible({ timeout: 2_000 });
	}).toPass({ timeout: 20_000 });
	return confirm;
}

async function minTouchSize(locator: Locator) {
	const box = await locator.boundingBox();
	expect(box, "element is rendered").not.toBeNull();
	return Math.min(box?.width ?? 0, box?.height ?? 0);
}

test.describe("Trinken on a phone (#74)", () => {
	test.beforeEach(async ({ page }) => {
		await signIn(page, USERS.rhMember);
	});

	test("a drink is ordered in two taps and under 5 s @mobile", async ({
		page,
		isMobile,
	}) => {
		await page.goto("/trinken", { waitUntil: "networkidle" });
		// The menu is server-rendered: header and drinks are there at once.
		await expect(
			page.getByRole("heading", { name: "Getränkekarte" }),
		).toBeVisible();
		await expect(drinkCard(page, "Spezi")).toBeVisible();

		// Hydration warm-up: open and close the drawer once, so the timed run
		// below measures the flow and not the first JS load.
		await openDrawerFor(page, "Spezi", isMobile);
		await page.keyboard.press("Escape");
		await expect(confirmButton(page)).toBeHidden();

		const started = Date.now();
		// Tap 1: the drink. The drawer opens with quantity 1.
		await tap(drinkCard(page, "Spezi"), isMobile);
		const confirm = confirmButton(page);
		await expect(confirm).toHaveText(/^Bestellen · 1,00\s€$/);
		// Tap 2: confirm. The drawer closes at once (optimistic) ...
		await tap(confirm, isMobile);
		await expect(confirm).toBeHidden({ timeout: 1_000 });
		// ... and the toast confirms once the server has booked it.
		const toast = page.getByText(/1x Spezi bestellt/);
		await expect(toast).toBeVisible();
		expect(Date.now() - started).toBeLessThan(5_000);
		await expect(toast).toContainText("eigene Kosten");
		await expect(toast).toContainText(/1,00\s€/);

		// Next visit: the drink is a shortcut at the top, again two taps away.
		await page.reload({ waitUntil: "networkidle" });
		const recent = page.getByRole("region", { name: "Zuletzt bestellt" });
		await expect(recent.locator('button[data-drink="Spezi"]')).toBeVisible();
	});

	test("a double tap on the confirm button books only once @mobile", async ({
		page,
		isMobile,
	}) => {
		await page.goto("/trinken", { waitUntil: "networkidle" });
		const confirm = await openDrawerFor(page, "Wasser", isMobile);
		// Two clicks in the same task: React has not re-rendered in between,
		// so only the order gate stands between them and a second booking.
		await confirm.evaluate((button: HTMLButtonElement) => {
			button.click();
			button.click();
		});
		await expect(page.getByText(/1x Wasser bestellt/)).toBeVisible();
		// Give a second request time to land, then count the outcomes.
		await page.waitForTimeout(1_500);
		await expect(
			page.getByText(/1x Wasser (bestellt|wird gebucht)/),
		).toHaveCount(1);
		// The drawer did not come back from the second tap either.
		await expect(confirmButton(page)).toBeHidden();
	});

	test("a group account shows outside the drawer and does not carry over @mobile", async ({
		page,
		isMobile,
	}) => {
		await page.goto("/trinken", { waitUntil: "networkidle" });
		const akn = page.getByRole("radio", { name: "AKN", exact: true });
		await expect(async () => {
			await tap(akn, isMobile);
			await expect(page.getByText("Buchung auf AKN").first()).toBeVisible({
				timeout: 2_000,
			});
		}).toPass({ timeout: 20_000 });

		const confirm = await openDrawerFor(page, "Wasser", isMobile);
		await expect(confirm).toHaveText(/^Auf AKN buchen · 0,60\s€$/);
		await tap(confirm, isMobile);
		await expect(page.getByText(/1x Wasser bestellt/)).toContainText(
			"Abrechnung auf AKN",
		);

		// Reset to the member after the order: the next drink is personal.
		await expect(page.getByText("Buchung auf AKN")).toHaveCount(0);
		const next = await openDrawerFor(page, "Wasser", isMobile);
		await expect(next).toHaveText(/^Bestellen · /);
	});

	test("every target in the order flow is at least 44 px @mobile", async ({
		page,
		isMobile,
	}) => {
		await page.goto("/trinken", { waitUntil: "networkidle" });
		expect(await minTouchSize(drinkCard(page, "Pils"))).toBeGreaterThanOrEqual(
			44,
		);
		for (const name of ["CC", "AKN", "CBesuch"]) {
			const chip = page.getByRole("radio", { name, exact: true });
			expect(await minTouchSize(chip), name).toBeGreaterThanOrEqual(44);
		}

		const confirm = await openDrawerFor(page, "Pils", isMobile);
		expect(await minTouchSize(confirm)).toBeGreaterThanOrEqual(44);
		for (const name of ["Menge verringern", "Menge erhöhen"]) {
			const stepper = page.getByRole("button", { name });
			expect(await minTouchSize(stepper), name).toBeGreaterThanOrEqual(44);
		}
		for (const name of ["1", "2", "Kasten (20)"]) {
			const chip = page.getByRole("button", { name, exact: true });
			expect(await minTouchSize(chip), name).toBeGreaterThanOrEqual(44);
		}

		// The Kasten preset updates the total on the confirm button.
		await tap(page.getByRole("button", { name: "Kasten (20)" }), isMobile);
		await expect(confirm).toHaveText(/^Bestellen · 24,00\s€$/);
	});
});
