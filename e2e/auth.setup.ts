// Signs every E2E user in once and stores the session cookies, so specs
// don't hit Better Auth's sign-in rate limit.

import { mkdirSync } from "node:fs";
import { expect, test as setup } from "@playwright/test";

import { AUTH_DIR, postSignIn, SESSIONS, sessionFile } from "./support";

setup("sign in all E2E users", async ({ browser }) => {
	setup.setTimeout(180_000);
	mkdirSync(AUTH_DIR, { recursive: true });
	for (const { email, origin } of SESSIONS) {
		const context = await browser.newContext();
		const res = await postSignIn(context.request, email, origin);
		expect(res.status(), `sign-in ${email} on ${origin}`).toBe(200);
		await context.storageState({ path: sessionFile(email, origin) });
		await context.close();
	}
});
