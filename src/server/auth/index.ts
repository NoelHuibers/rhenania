import bcrypt from "bcryptjs";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { env } from "~/env";
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
import { getTenantId } from "~/server/lib/tenant-context";
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
					if (!tenantId) return;

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
					if (!tenantSlug) return; // not one of our tenant-Microsoft providers

					const tenantId = await tenantIdFromSlug(tenantSlug);
					if (!tenantId) return;

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
 * Compatibility wrapper so all existing server actions/components can keep
 * calling `const session = await auth()` without any changes.
 *
 * Resolves the session from the control DB (Better Auth) and attaches
 * tenant-scoped roles fetched from the current tenant's DB.
 */
export async function auth() {
	const session = await betterAuthInstance.api.getSession({
		headers: await headers(),
	});

	if (!session) return null;

	const tenantId = await getTenantId();

	let roleNames: string[] = [];
	if (tenantId) {
		// Membership gate: only attach roles if the user is a member of the
		// current tenant. Non-members get an empty roles list — page-level
		// checks will reject them.
		const [membership] = await controlDb
			.select({ status: tenantMemberships.status })
			.from(tenantMemberships)
			.where(
				and(
					eq(tenantMemberships.userId, session.user.id),
					eq(tenantMemberships.tenantId, tenantId),
				),
			)
			.limit(1);

		if (membership && membership.status === "active") {
			const tdb = await getTenantDb(tenantId);
			const userRoleRows = await tdb
				.select({ roleName: roles.name })
				.from(userRoles)
				.innerJoin(roles, sql`${userRoles.roleId} = ${roles.id}`)
				.where(eq(userRoles.userId, session.user.id));
			roleNames = userRoleRows.map((r) => r.roleName);
		}
	}

	return {
		user: {
			id: session.user.id,
			email: session.user.email,
			name: session.user.name ?? null,
			image: session.user.image ?? null,
			roles: roleNames,
		},
	};
}
