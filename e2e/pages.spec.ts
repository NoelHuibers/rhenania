// Every page renders for the role that uses it (e.g. /bestellungen lists all
// orders for every member, like /rechnungen), without server errors,
// error toasts or the framework error page. Catches server actions that are
// guarded too tightly for the page that calls them.

import { expect, test } from "@playwright/test";

import { HASSIA, RHENANIA, signIn, USERS } from "./support";

const PAGES: Array<{ path: string; user: string; origin?: string }> = [
	{ path: "/trinken", user: USERS.rhMember },
	{ path: "/rechnungen", user: USERS.rhMember },
	{ path: "/bestellungen", user: USERS.rhMember },
	{ path: "/profile", user: USERS.rhMember },
	{ path: "/semesterprogramm", user: USERS.rhMember },
	{ path: "/leaderboard", user: USERS.rhMember },
	{ path: "/eloranking", user: USERS.rhMember },
	{ path: "/challenges", user: USERS.rhMember },
	{ path: "/kostenerstattung", user: USERS.rhMember },
	{ path: "/fuchsenladen", user: USERS.rhMember },
	{ path: "/fuchsenrechnungen", user: USERS.rhMember },
	{ path: "/fuchsenbestellungen", user: USERS.rhMember },
	{ path: "/getraenkewart", user: USERS.rhWart },
	{ path: "/getraenkewart?tab=inventur", user: USERS.rhWart },
	{ path: "/getraenkewart?tab=verlauf", user: USERS.rhWart },
	{ path: "/getraenkewart?tab=kasse", user: USERS.rhWart },
	{ path: "/getraenkewart?tab=buchung", user: USERS.rhWart },
	{ path: "/konten", user: USERS.rhWart },
	{ path: "/admin", user: USERS.rhAdmin },
	{ path: "/admin/semesterprogramm", user: USERS.rhAdmin },
	{ path: "/bilder", user: USERS.rhAdmin },
	{ path: "/cc-kasse", user: USERS.rhAdmin },
	{ path: "/fuchsenwart", user: USERS.rhAdmin },
	{ path: "/superadmin", user: USERS.rhAdmin },
	{ path: "/trinken", user: USERS.haMember, origin: HASSIA },
	{ path: "/getraenkewart?tab=kasse", user: USERS.haAdmin, origin: HASSIA },
];

for (const { path, user, origin = RHENANIA } of PAGES) {
	test(`${path} renders for ${user}`, async ({ page }) => {
		const failedActions: string[] = [];
		page.on("response", (res) => {
			if (res.request().method() === "POST" && res.status() >= 500) {
				failedActions.push(`${res.status()} ${res.url()}`);
			}
		});
		await signIn(page, user, origin);
		const res = await page.goto(`${origin}${path}`, {
			waitUntil: "networkidle",
		});

		expect(res?.status(), "page status").toBeLessThan(400);
		expect(page.url(), "not redirected to access-denied").not.toContain(
			"/access-denied",
		);
		await expect(
			page.getByText(/Application error|Internal Server Error/),
		).toHaveCount(0);
		await expect(
			page.locator('[data-sonner-toast][data-type="error"]'),
		).toHaveCount(0);
		expect(failedActions, "server actions answered 5xx").toEqual([]);
	});
}
