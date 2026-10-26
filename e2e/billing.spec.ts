import { expect, test } from "@playwright/test";

import {
	HASSIA,
	latestMailTo,
	mailCount,
	orderDrink,
	signIn,
	USERS,
} from "./support";

test.describe("billing", () => {
	test("Getränkewart runs a billing and the member is mailed a bill", async ({
		browser,
	}) => {
		const member = await browser.newPage();
		await signIn(member, USERS.rhMember);
		await orderDrink(member, "Weizen");
		await member.close();

		const wart = await browser.newPage();
		await signIn(wart, USERS.rhWart);
		await wart.goto("/getraenkewart?tab=kasse", { waitUntil: "networkidle" });
		const before = mailCount();
		const confirm = wart.getByRole("button", { name: "Ja, erstellen" });
		await expect(async () => {
			await wart.getByRole("button", { name: "Erstellen" }).click();
			await expect(confirm).toBeVisible({ timeout: 2_000 });
		}).toPass({ timeout: 20_000 });
		await confirm.click();
		await expect(
			wart.getByText("Neue Rechnung erfolgreich erstellt"),
		).toBeVisible({
			timeout: 30_000,
		});

		const mail = await latestMailTo(USERS.rhMember);
		expect(mailCount()).toBeGreaterThan(before);
		expect(mail.subject).toMatch(/Getränkerechnung/);
		await wart.close();
	});

	test("billing is refused until sender and account are set up (#9)", async ({
		page,
	}) => {
		// The Hassia seed has no billing profile, like a Corps that never set
		// one up: billing must stop with a hint instead of using another
		// Corps' account.
		await signIn(page, USERS.haAdmin, HASSIA);
		await page.goto(`${HASSIA}/getraenkewart?tab=kasse`, {
			waitUntil: "networkidle",
		});
		await expect(page.getByText("Unvollständig")).toBeVisible();
		const before = mailCount();
		const confirm = page.getByRole("button", { name: "Ja, erstellen" });
		await expect(async () => {
			await page.getByRole("button", { name: "Erstellen" }).click();
			await expect(confirm).toBeVisible({ timeout: 2_000 });
		}).toPass({ timeout: 20_000 });
		await confirm.click();
		await expect(
			page
				.getByText(/Bitte Absender und Konto in der Kasse hinterlegen/)
				.first(),
		).toBeVisible({ timeout: 30_000 });
		expect(mailCount()).toBe(before);
	});
});
