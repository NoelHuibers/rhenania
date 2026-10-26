// Visual regression: key screens on phone, tablet and desktop in light and
// dark mode. Baselines are rendered inside the official Playwright Linux
// image so fonts match CI; generate or update them with
// `pnpm test:visual:update` (needs podman or docker).

import { expect, type Page, test } from "@playwright/test";

import { HASSIA, RHENANIA, signIn, USERS } from "./support";

const VIEWPORTS = {
	phone: { width: 390, height: 844 },
	tablet: { width: 820, height: 1180 },
	desktop: { width: 1440, height: 900 },
} as const;

const SCREENS: Array<{
	name: string;
	url: string;
	user?: string;
	origin?: string;
	prepare?: (page: Page) => Promise<void>;
}> = [
	{ name: "signin", url: `${RHENANIA}/auth/signin` },
	{ name: "signin-hassia", url: `${HASSIA}/auth/signin` },
	{ name: "trinken", url: `${RHENANIA}/trinken`, user: USERS.rhMember },
	{
		name: "trinken-order-drawer",
		url: `${RHENANIA}/trinken`,
		user: USERS.rhMember,
		prepare: async (page) => {
			const card = page
				.locator('[data-slot="card"]')
				.filter({ has: page.getByText("Pils", { exact: true }) });
			const confirm = page.getByRole("button", { name: "Bestätigen" });
			await expect(async () => {
				await card.getByRole("button", { name: "Bestellen" }).click();
				await expect(confirm).toBeVisible({ timeout: 2_000 });
			}).toPass({ timeout: 20_000 });
		},
	},
	{
		name: "trinken-hassia",
		url: `${HASSIA}/trinken`,
		user: USERS.haMember,
		origin: HASSIA,
	},
	{ name: "access-denied", url: `${RHENANIA}/admin`, user: USERS.rhMember },
	{
		name: "getraenkewart",
		url: `${RHENANIA}/getraenkewart`,
		user: USERS.rhWart,
	},
	{ name: "admin", url: `${RHENANIA}/admin`, user: USERS.rhAdmin },
];

const HIDE_DYNAMIC = `
	*, *::before, *::after { caret-color: transparent !important; }
	[data-sonner-toaster] { display: none !important; }
`;

for (const scheme of ["light", "dark"] as const) {
	for (const [device, viewport] of Object.entries(VIEWPORTS)) {
		test.describe(`${device} ${scheme}`, () => {
			test.use({ viewport, colorScheme: scheme });

			for (const screen of SCREENS) {
				test(`${screen.name}`, async ({ page }) => {
					if (screen.user)
						await signIn(page, screen.user, screen.origin ?? RHENANIA);
					await page.goto(screen.url, { waitUntil: "networkidle" });
					await page.addStyleTag({ content: HIDE_DYNAMIC });
					await screen.prepare?.(page);
					await page.evaluate(() => document.fonts.ready);
					await expect(page).toHaveScreenshot(
						`${screen.name}-${device}-${scheme}.png`,
						{
							fullPage: true,
							animations: "disabled",
							maxDiffPixelRatio: 0.01,
						},
					);
				});
			}
		});
	}
}
