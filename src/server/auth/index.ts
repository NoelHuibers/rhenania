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
	tenants,
	users,
	verifications,
} from "~/server/db/control-schema";
import { roles, userRoles } from "~/server/db/schema";
import { getTenantDb } from "~/server/db/tenants";
import {
	getTenantId,
	resolveTenantByHost,
	TENANT_HEADER,
} from "~/server/lib/tenant-context";
import {
	mirrorUserToAllMemberTenants,
	mirrorUserToTenant,
} from "~/server/lib/user-mirror";
import { loadTenantOAuthProviders } from "./load-providers";
import { getMicrosoftUserInfo, requestedProviderId } from "./microsoft-linking";

// Per-tenant Microsoft OAuth providers are loaded from the control DB at
// process start. Adding a tenant or rotating an Azure secret requires a
// restart — accepted trade-off for the small number of Corps and infrequent
// rotations. Top-level await is supported in Next.js server modules.
const {
	providers: tenantOAuthProviders,
	trustedOrigins: tenantOrigins,
	allowedHosts: tenantAllowedHosts,
} = await loadTenantOAuthProviders();

const oauthConfigs = tenantOAuthProviders.map((p) => ({
	providerId: p.providerId,
	clientId: p.clientId,
	clientSecret: p.clientSecret,
	authorizationUrl: p.authorizationUrl,
	tokenUrl: p.tokenUrl,
	userInfoUrl: p.userInfoUrl,
	scopes: p.scopes,
	getUserInfo: (tokens: Parameters<typeof getMicrosoftUserInfo>[0]) =>
		getMicrosoftUserInfo(tokens, p),
	// No redirectURI — Better Auth derives `${baseURL}/oauth2/callback/${providerId}`
	// per request from the dynamic baseURL config below.
}));

const providerIdToTenantSlug = new Map(
	tenantOAuthProviders.map((p) => [p.providerId, p.tenantSlug]),
);

async function tenantIdFromSlug(slug: string): Promise<string | null> {
	const [row] = await controlDb
		.select({ id: tenants.id })
		.from(tenants)
		.where(eq(tenants.slug, slug))
		.limit(1);
	return row?.id ?? null;
}

/**
 * Refuses an OAuth sign-in, link or callback whose provider belongs to
 * another Corps than the request's host: each Corps' Microsoft login only
 * works on that Corps' own domains (GHSA-6f66-w6m6-cx4x).
 */
const providerMustMatchHost = createAuthMiddleware(async (ctx) => {
	const providerId = requestedProviderId(ctx);
	if (providerId === null) {
		return;
	}
	const headers = ctx.request?.headers ?? ctx.headers;
	const hostTenantId = await resolveTenantByHost(
		headers?.get("x-forwarded-host") ??
			headers?.get("host") ??
			(ctx.request ? new URL(ctx.request.url).host : null),
	);
	const slug = providerIdToTenantSlug.get(providerId);
	const providerTenantId = slug ? await tenantIdFromSlug(slug) : null;
	if (!hostTenantId || providerTenantId !== hostTenantId) {
		throw new APIError("FORBIDDEN", {
			message: "Dieser Anmeldeanbieter gehört nicht zu diesem Corps.",
		});
	}
});

export const betterAuthInstance = betterAuth({
	// Dynamic baseURL — derived from the request's host per call. This makes
	// the same Better Auth instance correctly mint redirect URLs and cookies
	// for every tenant domain (rhenania-stuttgart.de, www.rhenania-stuttgart.de,
	// hassia.de, localhost, …). Falls back to BETTER_AUTH_URL for contexts
	// without a request (e.g. server scripts).
	baseURL: {
		allowedHosts:
			tenantAllowedHosts.length > 0
				? tenantAllowedHosts
				: [new URL(env.BETTER_AUTH_URL).host],
		fallback: env.BETTER_AUTH_URL,
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
		sendResetPassword: async ({ user, url }, request) => {
			const tenantId =
				request?.headers.get(TENANT_HEADER) ?? (await getTenantId());
			if (!tenantId) {
				return;
			}

			// Identity is global, but reset mails must only be sent from a tenant
			// the user actually belongs to. Better Auth still returns the same
			// generic response when no matching membership exists.
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

	plugins:
		oauthConfigs.length > 0 ? [genericOAuth({ config: oauthConfigs })] : [],

	session: {
		expiresIn: 30 * 24 * 60 * 60,
		updateAge: 24 * 60 * 60,
	},

	trustedOrigins: Array.from(new Set([env.BETTER_AUTH_URL, ...tenantOrigins])),

	account: {
		accountLinking: {
			enabled: true,
			// No trusted providers: a Microsoft login links to an existing
			// identity only when its e-mail counts as verified, which
			// getMicrosoftUserInfo grants only for members of the provider's
			// Corps. Everyone else links explicitly while signed in.
		},
	},

	hooks: { before: providerMustMatchHost },

	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					// Determine which tenant this signup happened on. If we can't
					// (e.g. invoked outside a request context), skip — admin scripts
					// must call mirrorUserToTenant + insert membership explicitly.
					let tenantId: string | null = null;
					try {
						tenantId = await getTenantId();
					} catch {
						tenantId = null;
					}
					if (!tenantId) {
						return;
					}

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
					const tenantSlug = providerIdToTenantSlug.get(account.providerId);
					if (!tenantSlug) {
						return; // not one of our tenant-Microsoft providers
					}

					const tenantId = await tenantIdFromSlug(tenantSlug);
					if (!tenantId) {
						return;
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

/**
 * The signed-in identity, independent of the current tenant. Only for
 * platform-level checks (superadmin) and pages that must work for
 * non-members (access denied). Everything tenant-scoped uses `auth()`.
 */
export const getIdentity = cache(async () => {
	const session = await betterAuthInstance.api.getSession({
		headers: await headers(),
	});
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

/**
 * Session of the current request, scoped to the current tenant.
 *
 * Identity is global (one session works on every tenant's domain), so a
 * session alone must never grant access to a tenant's data. `auth()` returns
 * null unless the user has an ACTIVE membership in the tenant of the request,
 * and attaches that tenant's role names. Every server action that checks
 * `auth()` therefore also checks membership.
 */
// Memoized per request (React `cache`): every guarded server action and data
// loader calls auth(), and a page renders many of them at once. Without it
// each call repeats the session, membership and role lookups (#20).
export const auth = cache(async () => {
	const identity = await getIdentity();
	if (!identity) {
		return null;
	}

	// No tenant behind the host (unknown or suspended): nobody is a member.
	const tenantId = await getTenantId();
	if (!tenantId) {
		return null;
	}

	const [membership] = await controlDb
		.select({ status: tenantMemberships.status })
		.from(tenantMemberships)
		.where(
			and(
				eq(tenantMemberships.userId, identity.user.id),
				eq(tenantMemberships.tenantId, tenantId),
			),
		)
		.limit(1);
	if (membership?.status !== "active") {
		return null;
	}

	const tdb = await getTenantDb(tenantId);
	const userRoleRows = await tdb
		.select({ roleName: roles.name })
		.from(userRoles)
		.innerJoin(roles, sql`${userRoles.roleId} = ${roles.id}`)
		.where(eq(userRoles.userId, identity.user.id));

	return {
		user: {
			...identity.user,
			roles: userRoleRows.map((r) => r.roleName),
		},
	};
});
