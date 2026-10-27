import { expect, test } from "@playwright/test";
import { DEV_PASSWORD } from "../scripts/dev/seed-data";
import { latestMailTo, postSignIn, RHENANIA, USERS } from "./support";

test.describe("authentication", () => {
	// Production builds rate-limit sign-in per IP; start the UI sign-ins with a
	// fresh window instead of inheriting the setup project's attempts.
	test.beforeAll(async () => {
		if (!process.env.E2E_DEV) {
			await new Promise((r) => setTimeout(r, 11_000));
		}
	});

	test("anonymous visitors are sent to sign-in", async ({ page }) => {
		await page.goto("/trinken");
		await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=/);
	});

	test("member signs in with email and password @mobile", async ({ page }) => {
		await page.goto("/auth/signin?callbackUrl=/trinken", {
			waitUntil: "networkidle",
		});
		await page.locator("#email").pressSequentially(USERS.rhMember);
		await page.locator("#password").pressSequentially(DEV_PASSWORD);
		await page.getByRole("button", { name: "Mit E-Mail anmelden" }).click();

		await expect(page).toHaveURL(/\/trinken/);
		// "Pils" can be listed twice once it was ordered: in the "Zuletzt
		// bestellt" shortcuts and in the menu.
		await expect(page.getByText("Pils", { exact: true }).first()).toBeVisible();
	});

	test("a wrong password keeps the user on the sign-in page", async ({
		page,
	}) => {
		await page.goto("/auth/signin", { waitUntil: "networkidle" });
		await page.locator("#email").pressSequentially(USERS.rhMember);
		await page.locator("#password").pressSequentially("wrong-password");
		await page.getByRole("button", { name: "Mit E-Mail anmelden" }).click();

		await expect(page).toHaveURL(/\/auth\/signin/);
		const res = await page.request.get("/api/auth/get-session");
		expect(await res.json()).toBeNull();
	});

	test("password reset via the mailed link", async ({ page }) => {
		const newPassword = "NeuesPasswort123";
		await page.goto("/auth/forgot-password", { waitUntil: "networkidle" });
		await page.locator("#email").pressSequentially(USERS.rhReset);
		await page.getByRole("button", { name: "Reset-Link senden" }).click();

		const mail = await latestMailTo(USERS.rhReset);
		expect(mail.tenant).toBe("rhenania");
		const link = /https?:\/\/\S+reset-password\S+/.exec(mail.text)?.[0];
		expect(link, "reset link in mail").toBeTruthy();

		await page.goto(link as string, { waitUntil: "networkidle" });
		await expect(page).toHaveURL(/\/auth\/reset-password\?token=/);
		await page.locator("#password").pressSequentially(newPassword);
		await page.locator("#confirmPassword").pressSequentially(newPassword);
		await page.getByRole("button", { name: "Passwort speichern" }).click();

		await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 15_000 });
		const fresh = await postSignIn(
			page.request,
			USERS.rhReset,
			RHENANIA,
			newPassword,
		);
		expect(fresh.status()).toBe(200);
		const old = await postSignIn(
			page.request,
			USERS.rhReset,
			RHENANIA,
			DEV_PASSWORD,
		);
		expect(old.status()).toBe(401);
	});

	test("sign-in is rate limited in production builds", async ({ request }) => {
		test.skip(Boolean(process.env.E2E_DEV), "rate limiting is off in next dev");
		const statuses: number[] = [];
		for (let i = 0; i < 6; i++) {
			const res = await request.post(`${RHENANIA}/api/auth/sign-in/email`, {
				data: { email: USERS.rhMember, password: "wrong-password" },
				headers: { Origin: RHENANIA },
			});
			statuses.push(res.status());
		}
		expect(statuses).toContain(429);
	});
});
