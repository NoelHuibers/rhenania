// microsoft-linking.ts — which Corps may vouch for a Microsoft login
// (GHSA-6f66-w6m6-cx4x).
//
// Every Corps registers its own Entra app, and each Entra admin can put any
// e-mail address on a directory user. Better Auth links an OAuth login to an
// existing identity by e-mail when that e-mail counts as verified, so a
// provider's e-mail only counts as verified for an identity that already
// belongs to the provider's Corps. Everyone else has to link explicitly while
// signed in (`/oauth2/link`), which proves they own the identity.

import type { GenericOAuthConfig } from "better-auth/plugins/generic-oauth";
import { and, eq } from "drizzle-orm";

import { controlDb } from "~/server/db/control";
import { tenantMemberships, tenants, users } from "~/server/db/control-schema";
import type { TenantOAuthProvider } from "./load-providers";

type GetUserInfo = NonNullable<GenericOAuthConfig["getUserInfo"]>;
type OAuthTokens = Parameters<GetUserInfo>[0];
type OAuthUserInfo = NonNullable<Awaited<ReturnType<GetUserInfo>>>;
type Claims = Record<string, unknown>;

/** Better Auth endpoints that take a generic-OAuth provider id. */
const PROVIDER_ENDPOINTS = new Set([
	"/sign-in/oauth2",
	"/oauth2/link",
	"/oauth2/callback/:providerId",
]);

/** Provider id an auth request asks for, or null for every other endpoint. */
export function requestedProviderId(ctx: {
	path?: string;
	body?: unknown;
	params?: unknown;
}): string | null {
	if (!ctx.path || !PROVIDER_ENDPOINTS.has(ctx.path)) {
		return null;
	}
	const source = ctx.path.startsWith("/oauth2/callback/")
		? ctx.params
		: ctx.body;
	const providerId = (source as { providerId?: unknown } | undefined)
		?.providerId;
	// An endpoint that takes a provider but got none is refused, not skipped.
	return typeof providerId === "string" ? providerId : "";
}

/** Payload of a JWT without verifying it (the token came straight from Entra's token endpoint). */
export function decodeJwtClaims(token: string): Claims | null {
	const payload = token.split(".")[1];
	if (!payload) {
		return null;
	}
	try {
		const claims: unknown = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf8"),
		);
		return claims && typeof claims === "object" ? (claims as Claims) : null;
	} catch {
		return null;
	}
}

/**
 * Whether the identity with this e-mail already has a membership (in any
 * status) in the Corps. Matches the e-mail like Better Auth's own lookup.
 */
export async function isMemberByEmail(
	email: string,
	tenantSlug: string,
): Promise<boolean> {
	const [row] = await controlDb
		.select({ userId: tenantMemberships.userId })
		.from(users)
		.innerJoin(tenantMemberships, eq(tenantMemberships.userId, users.id))
		.innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
		.where(
			and(eq(users.email, email.toLowerCase()), eq(tenants.slug, tenantSlug)),
		)
		.limit(1);
	return Boolean(row);
}

async function fetchUserInfo(
	tokens: OAuthTokens,
	userInfoUrl: string,
): Promise<Claims | null> {
	if (!tokens.accessToken) {
		return null;
	}
	const res = await fetch(userInfoUrl, {
		headers: { Authorization: `Bearer ${tokens.accessToken}` },
	});
	if (!res.ok) {
		return null;
	}
	const profile: unknown = await res.json();
	return profile && typeof profile === "object" ? (profile as Claims) : null;
}

const text = (value: unknown) =>
	typeof value === "string" && value ? value : undefined;

/**
 * User info for a Corps' Microsoft provider. Refuses tokens issued by
 * another Entra tenant, and marks the e-mail verified only for an identity
 * that already belongs to this Corps.
 */
export async function getMicrosoftUserInfo(
	tokens: OAuthTokens,
	provider: Pick<
		TenantOAuthProvider,
		"providerId" | "tenantSlug" | "azureTenantId" | "userInfoUrl"
	>,
): Promise<OAuthUserInfo | null> {
	const claims = tokens.idToken ? decodeJwtClaims(tokens.idToken) : null;
	if (claims && claims.tid !== provider.azureTenantId) {
		console.warn(
			`[auth] ${provider.providerId}: ID token from Entra tenant ${String(claims.tid)} refused`,
		);
		return null;
	}

	// Like Better Auth's default: the ID token when it carries the e-mail,
	// otherwise the userinfo endpoint.
	const profile =
		claims?.sub && claims.email
			? claims
			: await fetchUserInfo(tokens, provider.userInfoUrl);
	const id = text(profile?.sub);
	if (!profile || !id) {
		return null;
	}

	const email = text(profile.email)?.toLowerCase();
	return {
		id,
		email,
		name: text(profile.name),
		image: text(profile.picture),
		emailVerified: email
			? await isMemberByEmail(email, provider.tenantSlug)
			: false,
	};
}
