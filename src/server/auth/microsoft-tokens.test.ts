import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { accounts } from "~/server/db/control-schema";
import {
	createAccount,
	microsoftConfig,
	setAuthConfig,
} from "../../../test/factories/platform";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
} from "../../../test/harness";
import { getGraphAccessToken } from "./microsoft-tokens";

setupTestDatabases();

const fetchMock = vi.fn<typeof fetch>();
const NOW = new Date("2026-10-26T12:00:00Z");

beforeEach(() => {
	vi.stubGlobal("fetch", fetchMock);
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

const inSeconds = (s: number) => new Date(NOW.getTime() + s * 1000);

async function msUser(account: Partial<typeof accounts.$inferInsert>) {
	const tenant = await createTenant({ slug: "hassia" });
	await setAuthConfig(tenant.id, microsoftConfig(1));
	const user = await createUser();
	await createAccount(user.id, "microsoft-hassia", account);
	return user;
}

const storedAccount = async (userId: string) =>
	(
		await controlDb()
			.select()
			.from(accounts)
			.where(
				and(
					eq(accounts.userId, userId),
					eq(accounts.providerId, "microsoft-hassia"),
				),
			)
	)[0];

describe("getGraphAccessToken", () => {
	test("returns the stored token while it is valid for more than a minute", async () => {
		const user = await msUser({
			accessToken: "stored",
			refreshToken: "refresh",
			accessTokenExpiresAt: inSeconds(120),
		});

		expect(await getGraphAccessToken(user.id)).toBe("stored");
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("refreshes a token about to expire and stores the new pair", async () => {
		const user = await msUser({
			accessToken: "old",
			refreshToken: "refresh-1",
			accessTokenExpiresAt: inSeconds(30),
		});
		fetchMock.mockResolvedValueOnce(
			Response.json({
				access_token: "new",
				refresh_token: "refresh-2",
				expires_in: 3600,
			}),
		);

		expect(await getGraphAccessToken(user.id)).toBe("new");

		const [url, init] = fetchMock.mock.lastCall ?? [];
		expect(url).toBe(
			"https://login.microsoftonline.com/azure-tenant-1/oauth2/v2.0/token",
		);
		expect(init?.method).toBe("POST");
		const body = new URLSearchParams(String(init?.body));
		expect(Object.fromEntries(body)).toEqual({
			client_id: "client-1",
			client_secret: "secret-1",
			grant_type: "refresh_token",
			refresh_token: "refresh-1",
			scope: "openid profile email offline_access User.Read",
		});
		expect(await storedAccount(user.id)).toMatchObject({
			accessToken: "new",
			refreshToken: "refresh-2",
			accessTokenExpiresAt: inSeconds(3600),
		});
	});

	test("keeps the old refresh token when Microsoft does not rotate it", async () => {
		const user = await msUser({ refreshToken: "keep-me" });
		fetchMock.mockResolvedValueOnce(
			Response.json({ access_token: "new", expires_in: "1800" }),
		);

		await getGraphAccessToken(user.id);

		expect(await storedAccount(user.id)).toMatchObject({
			accessToken: "new",
			refreshToken: "keep-me",
			accessTokenExpiresAt: inSeconds(1800),
		});
	});

	test("reports a failed refresh with status and body", async () => {
		const user = await msUser({ refreshToken: "revoked" });
		fetchMock.mockResolvedValueOnce(
			Response.json({ error: "invalid_grant" }, { status: 400 }),
		);

		await expect(getGraphAccessToken(user.id)).rejects.toThrow(
			'Failed to refresh Microsoft token: 400 {"error":"invalid_grant"}',
		);
		expect((await storedAccount(user.id))?.refreshToken).toBe("revoked");
	});

	test.fails("reports a failed refresh with a plain-text body (#152)", async () => {
		const user = await msUser({ refreshToken: "revoked" });
		fetchMock.mockResolvedValueOnce(
			new Response("Service Unavailable", { status: 503 }),
		);

		await expect(getGraphAccessToken(user.id)).rejects.toThrow(
			/Failed to refresh Microsoft token: 503/,
		);
	});

	test("asks for re-consent without a refresh token", async () => {
		const user = await msUser({ accessToken: "expired" });

		await expect(getGraphAccessToken(user.id)).rejects.toThrow(
			"No refresh token available; user must re-consent Microsoft.",
		);
	});

	test("fails clearly without a linked account or Microsoft config", async () => {
		const tenant = await createTenant({ slug: "hassia" });
		const user = await createUser();

		await expect(getGraphAccessToken(user.id)).rejects.toThrow(
			"Microsoft is not configured for the current tenant.",
		);

		await setAuthConfig(tenant.id, microsoftConfig());
		await createAccount(user.id, "microsoft-other-corps", {
			accessToken: "other",
			accessTokenExpiresAt: inSeconds(3600),
		});
		await expect(getGraphAccessToken(user.id)).rejects.toThrow(
			"Microsoft account not linked for this user in tenant 'hassia'.",
		);
	});
});
