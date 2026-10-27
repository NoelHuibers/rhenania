import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { env } from "~/env";
import { sendPasswordResetEmail } from "~/server/actions/newuser/email";
import { controlDb } from "~/server/db/control";
import {
	accounts,
	sessions,
	tenantMemberships,
	users,
	verifications,
} from "~/server/db/control-schema";
import { roles, userRoles } from "~/server/db/schema";
import { getTenantDb } from "~/server/db/tenants";
import { getTenantConfig, type TenantConfig } from "~/server/lib/tenant-config";
import {
	forgetMembership,
	getTenantById,
	getTenantId,
	hasActiveMembership,
	resolveTenantByHost,
	type TenantContext,
} from "~/server/lib/tenant-context";
import {
	mirrorUserToAllMemberTenants,
	mirrorUserToTenant,
} from "~/server/lib/user-mirror";
import { type TenantAuthSettings, tenantAuthSettings } from "./load-providers";
import { getMicrosoftUserInfo, requestedProviderId } from "./microsoft-linking";

// One Better Auth instance per tenant, built lazily from the cached tenant
// config and rebuilt when its hosts or Microsoft login change (#27). A new
// Corps, a new domain or a rotated Azure secret therefore works as soon as
// the tenant-config cache sees the change, without a redeploy, and importing
// this module never touches the control DB.
//
// All instances share AUTH_SECRET and the control-DB adapter, so sessions
// and identities stay global: a session minted on one Corps' domain is a
// valid session on every other (membership is the fence, see auth()).

function requestHost(h: Headers | undefined | null): string | null {
	return h?.get("x-forwarded-host") ?? h?.get("host") ?? null;
}

/**
 * Refuses an OAuth sign-in, link or callback unless it uses this tenant's
 * own provider on one of this tenant's hosts: each Corps' Microsoft login
 * only works on that Corps' own domains.
 */
function providerMustMatchHost(settings: TenantAuthSettings) {
	return createAuthMiddleware(async (ctx) => {
		const providerId = requestedProviderId(ctx);
		if (providerId === null) {
			return;
		}
		const hostTenantId = await resolveTenantByHost(
			requestHost(ctx.request?.headers ?? ctx.headers) ??
				(ctx.request ? new URL(ctx.request.url).host : null),
		);
		if (
			!settings.provider ||
			providerId !== settings.provider.providerId ||
			hostTenantId !== settings.tenantId
		) {
			throw new APIError("FORBIDDEN", {
				message: "Dieser Anmeldeanbieter gehört nicht zu diesem Corps.",
			});
		}
	});
}

function createTenantAuth(settings: TenantAuthSettings) {
	const { tenantId, provider } = settings;

	return betterAuth({
		// Dynamic baseURL: derived per request from the host, which must be
		// one of this tenant's domains, so redirect URLs and cookies match
		// the domain the user is on (rhenania-stuttgart.de, www.…, localhost).
		baseURL: {
			allowedHosts: settings.allowedHosts,
			fallback: settings.fallbackOrigin ?? env.BETTER_AUTH_URL,
		},
		secret: env.AUTH_SECRET,

		database: drizzleAdapter(controlDb, {
			provider: "sqlite",
			schema: {
				user: users,
				session: sessions,
				account: accounts,
				verification: verifications,
			},
		}),

		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			autoSignIn: false,
			resetPasswordTokenExpiresIn: 60 * 60,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, url }) => {
				// Identity is global, but reset mails must only be sent from a
				// tenant the user actually belongs to. Better Auth still returns
				// the same generic response when no matching membership exists.
				const [membership] = await controlDb
					.select({ userId: tenantMemberships.userId })
					.from(tenantMemberships)
					.where(
						and(
							eq(tenantMemberships.userId, user.id),
							eq(tenantMemberships.tenantId, tenantId),
							eq(tenantMemberships.status, "active"),
						),
					)
					.limit(1);
				if (!membership) {
					return;
				}

				await sendPasswordResetEmail(user.email, url);
			},
			password: {
				hash: (password) => bcrypt.hash(password, 12),
				verify: ({ hash, password }) => bcrypt.compare(password, hash),
			},
		},

		// Always registered, so a sign-in with a provider this tenant doesn't
		// have is refused by providerMustMatchHost (403), not a missing route.
		plugins: [
			genericOAuth({
				config: provider
					? [
							{
								providerId: provider.providerId,
								clientId: provider.clientId,
								clientSecret: provider.clientSecret,
								authorizationUrl: provider.authorizationUrl,
								tokenUrl: provider.tokenUrl,
								userInfoUrl: provider.userInfoUrl,
								scopes: provider.scopes,
								getUserInfo: (tokens) => getMicrosoftUserInfo(tokens, provider),
							},
						]
					: [],
			}),
		],

		session: {
			expiresIn: 30 * 24 * 60 * 60,
			updateAge: 24 * 60 * 60,
		},

		trustedOrigins: Array.from(
			new Set([env.BETTER_AUTH_URL, ...settings.trustedOrigins]),
		),

		account: {
			accountLinking: {
				enabled: true,
				// No trusted providers: a Microsoft login links to an existing
				// identity only when its e-mail counts as verified, which
				// getMicrosoftUserInfo grants only for members of the provider's
				// Corps. Everyone else links explicitly while signed in.
			},
		},

		hooks: { before: providerMustMatchHost(settings) },

		databaseHooks: {
			user: {
				create: {
					// A signup joins the tenant whose domain it happened on.
					after: async (user) => {
						const mirrored = {
							id: user.id,
							name: user.name ?? null,
							email: user.email,
							emailVerified: Boolean(user.emailVerified),
							image: user.image ?? null,
							createdAt: user.createdAt ?? new Date(),
							updatedAt: user.updatedAt ?? new Date(),
						};

						await controlDb
							.insert(tenantMemberships)
							.values({ userId: user.id, tenantId, status: "active" })
							.onConflictDoNothing({
								target: [tenantMemberships.userId, tenantMemberships.tenantId],
							});
						forgetMembership(user.id, tenantId);

						await mirrorUserToTenant(mirrored, tenantId);
					},
				},
				update: {
					after: async (user) => {
						await mirrorUserToAllMemberTenants({
							id: user.id,
							name: user.name ?? null,
							email: user.email,
							emailVerified: Boolean(user.emailVerified),
							image: user.image ?? null,
							createdAt: user.createdAt ?? new Date(),
							updatedAt: user.updatedAt ?? new Date(),
						});
					},
				},
			},
			account: {
				create: {
					// Fires when an OAuth account is linked: a new user's first
					// login, a member's implicit link, or an explicit link by a
					// signed-in user (`/oauth2/link`), which is how an existing
					// identity joins another Corps through its Microsoft login.
					// (The user.create hook only fires for brand-new users.)
					after: async (account) => {
						if (!provider || account.providerId !== provider.providerId) {
							return; // e.g. the credential account of a signup
						}

						await controlDb
							.insert(tenantMemberships)
							.values({
								userId: account.userId,
								tenantId,
								status: "active",
							})
							.onConflictDoNothing({
								target: [tenantMemberships.userId, tenantMemberships.tenantId],
							});
						forgetMembership(account.userId, tenantId);

						const [u] = await controlDb
							.select()
							.from(users)
							.where(eq(users.id, account.userId))
							.limit(1);
						if (u) {
							await mirrorUserToTenant(
								{
									id: u.id,
									name: u.name,
									email: u.email,
									emailVerified: u.emailVerified,
									image: u.image,
									createdAt: u.createdAt,
									updatedAt: u.updatedAt,
								},
								tenantId,
							);
						}
					},
				},
			},
		},
	});
}

export type TenantAuth = ReturnType<typeof createTenantAuth>;

type InstanceEntry = {
	/** Config object the instance was last checked against (cache identity). */
	config: TenantConfig;
	/** Serialized settings the instance was built from. */
	key: string;
	auth: TenantAuth;
};

const instances = new Map<string, InstanceEntry>();

/**
 * Better Auth for a tenant, or null if it doesn't exist or is suspended.
 * Reuses the instance while the tenant's auth settings are unchanged; the
 * tenant-config cache decides how fast changes are seen.
 */
export async function getAuthForTenant(
	tenantId: string,
): Promise<TenantAuth | null> {
	const config = await getTenantConfig(tenantId);
	if (!config || config.status === "suspended") {
		instances.delete(tenantId);
		return null;
	}
	const cached = instances.get(tenantId);
	if (cached?.config === config) {
		return cached.auth;
	}
	const settings = tenantAuthSettings(config);
	const key = JSON.stringify(settings);
	if (cached?.key === key) {
		cached.config = config;
		return cached.auth;
	}
	const auth = createTenantAuth(settings);
	instances.set(tenantId, { config, key, auth });
	return auth;
}

/** Better Auth for the tenant a request's host belongs to; null for unknown hosts. */
export async function getAuthForRequest(
	h: Headers,
): Promise<TenantAuth | null> {
	const tenantId = await resolveTenantByHost(requestHost(h));
	return tenantId ? getAuthForTenant(tenantId) : null;
}

/** Drops this instance's Better Auth instances (tests). */
export function clearAuthInstances(): void {
	instances.clear();
}

/**
 * The signed-in identity, independent of the current tenant. Only for
 * platform-level checks (superadmin) and pages that must work for
 * non-members (access denied). Everything tenant-scoped uses `auth()`.
 * Null on hosts that belong to no tenant.
 */
export const getIdentity = cache(async () => {
	const h = await headers();
	const tenantAuth = await getAuthForRequest(h);
	const session = await tenantAuth?.api.getSession({ headers: h });
	if (!session) {
		return null;
	}
	return {
		user: {
			id: session.user.id,
			email: session.user.email,
			name: session.user.name ?? null,
			image: session.user.image ?? null,
		},
	};
});

type Identity = NonNullable<Awaited<ReturnType<typeof getIdentity>>>;

/** The signed-in identity as a member of the request's tenant. */
export type RequestMember = Identity["user"] & { roles: string[] };

export type RequestContext = {
	/** Tenant id of the request's host; null for unknown hosts and scripts. */
	tenantId: string | null;
	/** That tenant's config and feature flags. */
	tenant: TenantContext | null;
	/** The signed-in identity, whatever its memberships (null without a tenant). */
	identity: Identity | null;
	/** The identity with its roles in `tenant`, only if its membership there is ACTIVE. */
	member: RequestMember | null;
};

/**
 * Everything the guards and loaders need about the caller, resolved once per
 * request (React `cache`) however many components and actions ask (#20).
 *
 * Cost per request: Better Auth's session lookup (control DB), the
 * membership check (cached per instance for MEMBERSHIP_CACHE_TTL_MS, shared
 * with the proxy) and one role query (tenant DB). Tenant config comes from
 * the tenant-config cache.
 *
 * Identity is global (one session works on every tenant's domain), so a
 * session alone must never grant access to a tenant's data: `member` is null
 * unless the membership in the request's tenant is active.
 */
export const getRequestContext = cache(async (): Promise<RequestContext> => {
	const [identity, tenantId] = await Promise.all([
		getIdentity(),
		getTenantId(),
	]);
	const tenant = tenantId ? await getTenantById(tenantId) : null;
	// Without a tenant there is no identity either: sessions are read
	// through the tenant's Better Auth instance.
	if (
		!identity ||
		!tenantId ||
		!tenant ||
		!(await hasActiveMembership(identity.user.id, tenantId))
	) {
		return { tenantId, tenant, identity, member: null };
	}

	const tdb = await getTenantDb(tenantId);
	const userRoleRows = await tdb
		.select({ roleName: roles.name })
		.from(userRoles)
		.innerJoin(roles, sql`${userRoles.roleId} = ${roles.id}`)
		.where(eq(userRoles.userId, identity.user.id));

	return {
		tenantId,
		tenant,
		identity,
		member: {
			...identity.user,
			roles: userRoleRows.map((r) => r.roleName),
		},
	};
});

/**
 * Session of the current request, scoped to the current tenant: null unless
 * the user has an ACTIVE membership in the tenant of the request, with that
 * tenant's role names. Every server action that checks `auth()` therefore
 * also checks membership. A thin view of `getRequestContext()`.
 */
export const auth = cache(async () => {
	const { member } = await getRequestContext();
	return member ? { user: member } : null;
});
