// Shared helpers for the E2E suite. Data comes from scripts/dev/seed-data.ts.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { type APIRequestContext, expect, type Page } from "@playwright/test";

import { DEV_PASSWORD } from "../scripts/dev/seed-data";

export const RHENANIA = "http://localhost:3000";
export const HASSIA = "http://hassia.localhost:3000";
export const MAIL_DIR = path.resolve(".data/e2e/mail");

export const USERS = {
	rhAdmin: "admin@rhenania.test",
	rhWart: "wart@rhenania.test",
	rhMember: "member@rhenania.test",
	rhReset: "reset@rhenania.test",
	haAdmin: "admin@hassia.test",
	haMember: "member@hassia.test",
	both: "both@example.test",
} as const;

export const AUTH_DIR = path.resolve(".data/e2e/auth");

/** Sessions created once by `auth.setup.ts` (sign-in is rate limited). */
export const SESSIONS: Array<{ email: string; origin: string }> = [
	{ email: USERS.rhAdmin, origin: RHENANIA },
	{ email: USERS.rhWart, origin: RHENANIA },
	{ email: USERS.rhMember, origin: RHENANIA },
	{ email: USERS.rhMember, origin: HASSIA },
	{ email: USERS.haAdmin, origin: HASSIA },
	{ email: USERS.haMember, origin: HASSIA },
	{ email: USERS.both, origin: RHENANIA },
	{ email: USERS.both, origin: HASSIA },
];

export function sessionFile(email: string, origin: string) {
	return path.join(AUTH_DIR, `${email}@${new URL(origin).hostname}.json`);
}

/**
 * Posts to the sign-in endpoint, waiting out Better Auth's rate limit
 * (production builds allow only a few sign-ins per 10 s and IP).
 */
export async function postSignIn(
	request: APIRequestContext,
	email: string,
	origin: string = RHENANIA,
	password: string = DEV_PASSWORD,
) {
	for (let attempt = 0; ; attempt++) {
		const res = await request.post(`${origin}/api/auth/sign-in/email`, {
			data: { email, password },
			headers: { Origin: origin },
		});
		if (res.status() !== 429 || attempt >= 8) {
			return res;
		}
		await new Promise((r) => setTimeout(r, 2_500));
	}
}

/** Puts the stored session cookies of `email` on `origin` into the page's context. */
export async function signIn(
	page: Page,
	email: string,
	origin: string = RHENANIA,
) {
	const file = sessionFile(email, origin);
	if (!existsSync(file)) {
		throw new Error(
			`No stored session for ${email} on ${origin}; add it to SESSIONS.`,
		);
	}
	const state = JSON.parse(readFileSync(file, "utf8")) as {
		cookies: Parameters<ReturnType<Page["context"]>["addCookies"]>[0];
	};
	await page.context().addCookies(state.cookies);
}

export type OutboxMail = {
	tenant: string | null;
	to: string;
	subject: string;
	text: string;
	html: string | null;
};

/** Newest mail in the local outbox for a recipient, waiting up to 10 s. */
export async function latestMailTo(to: string): Promise<OutboxMail> {
	let found: OutboxMail | undefined;
	await expect
		.poll(
			() => {
				if (!existsSync(MAIL_DIR)) {
					return undefined;
				}
				const mails = readdirSync(MAIL_DIR)
					.sort()
					.map(
						(f) =>
							JSON.parse(
								readFileSync(path.join(MAIL_DIR, f), "utf8"),
							) as OutboxMail,
					)
					.filter((m) => m.to === to);
				found = mails.at(-1);
				return found?.subject;
			},
			{ timeout: 10_000 },
		)
		.toBeTruthy();
	return found as OutboxMail;
}

export function mailCount(): number {
	return existsSync(MAIL_DIR) ? readdirSync(MAIL_DIR).length : 0;
}

/** The shadcn card that shows a drink on /trinken. */
export function drinkCard(page: Page, name: string) {
	return page
		.locator('[data-slot="card"]')
		.filter({ has: page.getByText(name, { exact: true }) });
}

/** Opens /trinken and books `name` once, waiting for the success toast. */
export async function orderDrink(page: Page, name: string, origin = RHENANIA) {
	await page.goto(`${origin}/trinken`, { waitUntil: "networkidle" });
	const card = drinkCard(page, name);
	await expect(card).toBeVisible();
	const confirm = page.getByRole("button", { name: "Bestätigen" });
	// The first click can land before hydration; retry until the drawer opens.
	await expect(async () => {
		await card.getByRole("button", { name: "Bestellen" }).click();
		await expect(confirm).toBeVisible({ timeout: 2_000 });
	}).toPass({ timeout: 20_000 });
	await confirm.click();
	const toast = page.getByText(new RegExp(`1x ${name} bestellt`));
	await expect(toast).toBeVisible();
	return (await toast.textContent()) ?? "";
}
