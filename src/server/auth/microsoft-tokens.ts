// ~/server/auth/microsoft-tokens.ts
import { and, eq } from "drizzle-orm";
import { env } from "~/env";
import { db } from "~/server/db";
import { accounts } from "~/server/db/schema";

const tokenEndpoint = `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`;

type MsAccountRow = {
	accessToken: string | null;
	refreshToken: string | null;
	accessTokenExpiresAt: Date | null;
};

export async function getGraphAccessToken(userId: string): Promise<string> {
	const [acc] = (await db
		.select({
			accessToken: accounts.accessToken,
			refreshToken: accounts.refreshToken,
			accessTokenExpiresAt: accounts.accessTokenExpiresAt,
		})
		.from(accounts)
		.where(
			and(
				eq(accounts.userId, userId),
				eq(accounts.providerId, "microsoft"),
			),
		)
		.limit(1)) as [MsAccountRow?];

	if (!acc) {
		throw new Error("Microsoft account not linked for this user.");
	}

	const now = Math.floor(Date.now() / 1000);
	const expiresAt = acc.accessTokenExpiresAt
		? Math.floor(acc.accessTokenExpiresAt.getTime() / 1000)
		: 0;

	// If token valid for at least 60 more seconds, use it
	if (acc.accessToken && expiresAt - 60 > now) {
		return acc.accessToken;
	}

	// Otherwise refresh
	if (!acc.refreshToken) {
		throw new Error(
			"No refresh token available; user must re-consent Microsoft.",
		);
	}

	const refreshed = await refreshMicrosoftToken(acc.refreshToken);

	// Persist new tokens
	await db
		.update(accounts)
		.set({
			accessToken: refreshed.accessToken,
			refreshToken: refreshed.refreshToken,
			accessTokenExpiresAt: new Date(refreshed.expiresAt * 1000),
		})
		.where(
			and(
				eq(accounts.userId, userId),
				eq(accounts.providerId, "microsoft"),
			),
		);

	return refreshed.accessToken;
}

async function refreshMicrosoftToken(refreshToken: string) {
	const body = new URLSearchParams({
		// biome-ignore lint/style/noNonNullAssertion: env vars are validated at startup
		client_id: env.AZURE_AD_CLIENT_ID!,
		// biome-ignore lint/style/noNonNullAssertion: env vars are validated at startup
		client_secret: env.AZURE_AD_CLIENT_SECRET!,
		grant_type: "refresh_token",
		refresh_token: refreshToken,
		// Keep scopes consistent with your provider config
		scope: "openid profile email offline_access User.Read",
		// Many Azure tenants require the original redirect_uri for refresh:
		redirect_uri: `${env.BETTER_AUTH_URL}/api/auth/callback/microsoft`,
	});

	const res = await fetch(tokenEndpoint, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
		// If you're on Next.js App Router, make sure this runs on Node, not Edge,
		// or move this into a server action/route with `export const runtime = "nodejs"`.
	});

	if (!res.ok) {
		const err = await safeJson(res);
		throw new Error(
			`Failed to refresh Microsoft token: ${res.status} ${JSON.stringify(err)}`,
		);
	}

	const json = (await res.json()) as {
		access_token: string;
		refresh_token?: string;
		expires_in: number; // seconds
		token_type?: string;
	};

	return {
		accessToken: json.access_token,
		refreshToken: json.refresh_token ?? refreshToken, // MS may rotate it
		expiresAt: Math.floor(Date.now() / 1000) + Number(json.expires_in),
	};
}

async function safeJson(res: Response) {
	try {
		return await res.json();
	} catch {
		return await res.text();
	}
}
