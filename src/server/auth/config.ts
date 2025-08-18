import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import type { DefaultSession, NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  accounts,
  roles,
  sessions,
  userRoles,
  users,
  verificationTokens,
} from "~/server/db/schema";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      roles: string[];
      // ...other properties
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    roles?: string[];
  }
}

export const authConfig = {
  providers: [
    MicrosoftEntraID({
      clientId: env.AZURE_AD_CLIENT_ID,
      clientSecret: env.AZURE_AD_CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/v2.0`,
    }),
  ],
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    session: async ({ session, user }) => {
      if (session.user) {
        // Fetch user roles from the database
        const userWithRoles = await db
          .select({
            roleName: roles.name,
          })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(eq(userRoles.userId, user.id));

        // Extract role names and add to session
        const userRoleNames = userWithRoles.map((ur) => ur.roleName);

        return {
          ...session,
          user: {
            ...session.user,
            id: user.id,
            roles: userRoleNames,
          },
        };
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
