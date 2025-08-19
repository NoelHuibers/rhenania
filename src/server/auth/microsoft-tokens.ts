// ~/server/auth/microsoft-tokens.ts
import { and, eq } from "drizzle-orm";
import { env } from "~/env";
import { db } from "~/server/db";
import { accounts } from "~/server/db/schema";

const tokenEndpoint = `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`;

type MsAccountRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null; // seconds since epoch
  token_type: string | null;
};

export async function getGraphAccessToken(userId: string): Promise<string> {
  const [acc] = (await db
    .select({
      access_token: accounts.access_token,
      refresh_token: accounts.refresh_token,
      expires_at: accounts.expires_at,
      token_type: accounts.token_type,
    })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.provider, "microsoft-entra-id")
      )
    )
    .limit(1)) as [MsAccountRow?];

  if (!acc) {
    throw new Error("Microsoft account not linked for this user.");
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = acc.expires_at ?? 0;

  // If token valid for at least 60 more seconds, use it
  if (acc.access_token && expiresAt - 60 > now) {
    return acc.access_token;
  }

  // Otherwise refresh
  if (!acc.refresh_token) {
    throw new Error(
      "No refresh token available; user must re-consent Microsoft."
    );
  }

  const refreshed = await refreshMicrosoftToken(acc.refresh_token);

  // Persist new tokens
  await db
    .update(accounts)
    .set({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      expires_at: refreshed.expires_at,
      token_type: refreshed.token_type ?? acc.token_type,
    })
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.provider, "microsoft-entra-id")
      )
    );

  return refreshed.access_token;
}

async function refreshMicrosoftToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: env.AZURE_AD_CLIENT_ID!,
    client_secret: env.AZURE_AD_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    // Keep scopes consistent with your provider config
    scope: "openid profile email offline_access User.Read",
    // Many Azure tenants require the original redirect_uri for refresh:
    redirect_uri: `${env.NEXTAUTH_URL}/api/auth/callback/microsoft-entra-id`,
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
      `Failed to refresh Microsoft token: ${res.status} ${JSON.stringify(err)}`
    );
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number; // seconds
    token_type?: string;
  };

  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? refreshToken, // MS may rotate it
    expires_at: Math.floor(Date.now() / 1000) + Number(json.expires_in),
    token_type: json.token_type,
  };
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return await res.text();
  }
}
