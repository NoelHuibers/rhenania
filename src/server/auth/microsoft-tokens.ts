// ~/server/auth/microsoft-tokens.ts
//
// Refreshes Microsoft Graph access tokens. Per-tenant: looks up the current
// tenant's Azure config (clientId, clientSecret, tenantId) and the matching
// `accounts` row keyed on `microsoft-<tenant-slug>` providerId.

import { and, eq } from "drizzle-orm";
import { controlDb } from "~/server/db/control";
import { accounts } from "~/server/db/control-schema";
import { getCurrentTenantAzureConfig } from "~/server/lib/tenant-azure-config";

type MsAccountRow = {
	accessToken: string | null;
	refreshToken: string | null;
	accessTokenExpiresAt: Date | null;
};

export async function getGraphAccessToken(userId: string): Promise<string> {
	const azure = await getCurrentTenantAzureConfig();
	if (!azure) {
		throw new Error("Microsoft is not configured for the current tenant.");
	}

	const [acc] = (await controlDb
		.select({
			accessToken: accounts.accessToken,
			refreshToken: accounts.refreshToken,
			accessTokenExpiresAt: accounts.accessTokenExpiresAt,
		})
		.from(accounts)
		.where(
			and(
				eq(accounts.userId, userId),
				eq(accounts.providerId, azure.microsoftProviderId),
			),
		)
		.limit(1)) as [MsAccountRow?];

	if (!acc) {
		throw new Error(
			`Microsoft account not linked for this user in tenant '${azure.tenantSlug}'.`,
		);
	}

	const now = Math.floor(Date.now() / 1000);
	const expiresAt = acc.accessTokenExpiresAt
		? Math.floor(acc.accessTokenExpiresAt.getTime() / 1000)
		: 0;

	if (acc.accessToken && expiresAt - 60 > now) {
		return acc.accessToken;
	}

	if (!acc.refreshToken) {
		throw new Error(
			"No refresh token available; user must re-consent Microsoft.",
		);
	}

	const refreshed = await refreshMicrosoftToken(acc.refreshToken, azure);

	await controlDb
		.update(accounts)
		.set({
			accessToken: refreshed.accessToken,
			refreshToken: refreshed.refreshToken,
			accessTokenExpiresAt: new Date(refreshed.expiresAt * 1000),
		})
		.where(
			and(
				eq(accounts.userId, userId),
				eq(accounts.providerId, azure.microsoftProviderId),
			),
		);

	return refreshed.accessToken;
}

async function refreshMicrosoftToken(
	refreshToken: string,
	azure: {
		azureClientId: string;
		azureClientSecret: string;
		azureTenantId: string;
	},
) {
	const tokenEndpoint = `https://login.microsoftonline.com/${azure.azureTenantId}/oauth2/v2.0/token`;

	// `redirect_uri` is intentionally omitted — Microsoft's refresh_token grant
	// does not require it, and including a mismatched URI (we have multiple
	// per-tenant) would fail.
	const body = new URLSearchParams({
		client_id: azure.azureClientId,
		client_secret: azure.azureClientSecret,
		grant_type: "refresh_token",
		refresh_token: refreshToken,
		scope: "openid profile email offline_access User.Read",
	});

	const res = await fetch(tokenEndpoint, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
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
		expires_in: number;
		token_type?: string;
	};

	return {
		accessToken: json.access_token,
		refreshToken: json.refresh_token ?? refreshToken,
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
