import { describe, expect, test } from "vitest";
import { toCoreCallback } from "./legacy-callback";

describe("toCoreCallback", () => {
	test("maps the pre-1.7 callback path to the core one, keeping the query", async () => {
		const req = new Request(
			"https://corps.example/api/auth/oauth2/callback/microsoft-corps?code=c&state=s",
			{ headers: { cookie: "a=b" } },
		);
		const out = await toCoreCallback(req);
		expect(out.url).toBe(
			"https://corps.example/api/auth/callback/microsoft-corps?code=c&state=s",
		);
		expect(out.method).toBe("GET");
		expect(out.headers.get("cookie")).toBe("a=b");
	});

	test("keeps the body of a form_post callback", async () => {
		const req = new Request(
			"https://corps.example/api/auth/oauth2/callback/microsoft-corps",
			{
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: "code=c&state=s",
			},
		);
		const out = await toCoreCallback(req);
		expect(out.url).toBe(
			"https://corps.example/api/auth/callback/microsoft-corps",
		);
		expect(await out.text()).toBe("code=c&state=s");
	});

	test("leaves every other request alone", async () => {
		for (const path of [
			"/api/auth/sign-in/social",
			"/api/auth/callback/microsoft-corps",
			"/api/auth/get-session",
		]) {
			const req = new Request(`https://corps.example${path}`);
			expect(await toCoreCallback(req)).toBe(req);
		}
	});
});
