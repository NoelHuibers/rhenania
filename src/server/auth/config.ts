import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import type { DefaultSession, NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
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

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      roles: string[];
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    roles?: string[];
    password?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    roles: string[];
  }
}

export const authConfig = {
  providers: [
    MicrosoftEntraID({
      clientId: env.AZURE_AD_CLIENT_ID!,
      clientSecret: env.AZURE_AD_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/v2.0`,
    }),
    Credentials({
      id: "credentials",
      name: "Email and Password",
      credentials: {
        email: {
          label: "Email",
          type: "email",
          placeholder: "user@example.com",
        },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const emailInput = (credentials?.email as string)?.trim().toLowerCase();
        const passwordInput = credentials?.password;

        if (!emailInput || !passwordInput) {
          throw new Error("Email and password are required");
        }

        try {
          const rows = await db
            .select()
            .from(users)
            .where(sql`lower(${users.email}) = ${emailInput}`)
            .limit(1);

          if (rows.length === 0) {
            throw new Error("Invalid email or password");
          }

          const foundUser = rows[0];

          if (!foundUser || !foundUser.password) {
            throw new Error("Invalid email or password");
          }

          if (!foundUser.emailVerified) {
            throw new Error("Please verify your email first");
          }

          const isValidPassword = await bcrypt.compare(
            passwordInput as string,
            foundUser.password
          );

          if (!isValidPassword) {
            throw new Error("Invalid email or password");
          }

          // Return user object - this will be available in the jwt callback
          return {
            id: foundUser.id,
            email: foundUser.email,
            name: foundUser.name,
            image: foundUser.image,
          };
        } catch (error) {
          console.error("Authorization error:", error);
          // Return null to indicate failed authentication
          return null;
        }
      },
    }),
  ],
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async signIn({ user, account }) {
      // Allow OAuth and credentials providers
      if (account?.provider === "microsoft-entra-id") return true;
      if (account?.provider === "credentials") return true;
      return true;
    },

    async jwt({ token, user, account }) {
      // Initial sign in
      if (user && account) {
        token.id = user.id!;

        // Load user roles
        const userRoleRows = await db
          .select({ roleName: roles.name })
          .from(userRoles)
          .innerJoin(roles, sql`${userRoles.roleId} = ${roles.id}`)
          .where(sql`${userRoles.userId} = ${user.id}`);

        token.roles = userRoleRows.map((r) => r.roleName);
      }

      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.roles = token.roles || [];
      }

      return session;
    },

    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
  session: {
    strategy: "jwt", // Changed from "database" to "jwt"
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  trustHost: true,
  useSecureCookies: process.env.NODE_ENV === "production",
} satisfies NextAuthConfig;
