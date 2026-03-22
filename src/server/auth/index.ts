import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { env } from "~/env";
import { db } from "~/server/db";
import {
	accounts,
	roles,
	sessions,
	userRoles,
	users,
	verifications,
} from "~/server/db/schema";

export const betterAuthInstance = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: env.AUTH_SECRET,

	database: drizzleAdapter(db, {
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

	socialProviders: {
		microsoft: {
			// biome-ignore lint/style/noNonNullAssertion: env vars validated at startup
			clientId: env.AZURE_AD_CLIENT_ID!,
			// biome-ignore lint/style/noNonNullAssertion: env vars validated at startup
			clientSecret: env.AZURE_AD_CLIENT_SECRET!,
			tenantId: env.AZURE_AD_TENANT_ID,
			scope: ["openid", "profile", "email", "offline_access", "User.Read"],
		},
	},

	session: {
		expiresIn: 30 * 24 * 60 * 60,
		updateAge: 24 * 60 * 60,
	},

	trustedOrigins: [env.BETTER_AUTH_URL],

	account: {
		accountLinking: {
			enabled: true,
			trustedProviders: ["microsoft"],
		},
	},
});

/**
 * Compatibility wrapper so all existing server actions/components can keep
 * calling `const session = await auth()` without any changes.
 *
 * Fetches roles from DB and injects them into the returned session, matching
 * the shape that was previously provided by the NextAuth session callback.
 */
export async function auth() {
	const session = await betterAuthInstance.api.getSession({
		headers: await headers(),
	});

	if (!session) return null;

	const userRoleRows = await db
		.select({ roleName: roles.name })
		.from(userRoles)
		.innerJoin(roles, sql`${userRoles.roleId} = ${roles.id}`)
		.where(eq(userRoles.userId, session.user.id));

	return {
		user: {
			id: session.user.id,
			email: session.user.email,
			name: session.user.name ?? null,
			image: session.user.image ?? null,
			roles: userRoleRows.map((r) => r.roleName),
		},
	};
}
