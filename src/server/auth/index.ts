import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
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
import { getTenantId, TENANT_HEADER } from "~/server/lib/tenant-context";
import {
	mirrorUserToAllMemberTenants,
	mirrorUserToTenant,
} from "~/server/lib/user-mirror";
import { loadTenantOAuthProviders } from "./load-providers";

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
			// Per-tenant Microsoft providers are all trusted (they're owned by
			// the tenant's own Azure tenant — same identity guarantee as the
			// previous single-provider setup).
			trustedProviders: tenantOAuthProviders.map((p) => p.providerId),
		},
	},

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
				// Fires when an OAuth account is linked. For an EXISTING user
				// signing in via OAuth at a new tenant, this is where we
				// auto-create the tenant membership + mirror the user.
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

	const tenantId = await getTenantId();
	if (!tenantId) {
		// No tenant in scope (scripts, build): identity only, no roles.
		return { user: { ...identity.user, roles: [] as string[] } };
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
