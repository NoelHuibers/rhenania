// config.ts
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";
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
    // accessToken?: string; // If you really need to expose a token to the client, re-enable and set it in `session`
  }

  interface User {
    id?: string;
    roles?: string[];
    password?: string | null;
  }
}

export const authConfig = {
  providers: [
    MicrosoftEntraID({
      clientId: env.AZURE_AD_CLIENT_ID!,
      clientSecret: env.AZURE_AD_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/v2.0`,
      authorization: {
        params: {
          scope: ["openid", "profile", "offline_access", "User.Read"].join(" "),
        },
      },
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

          if (rows.length === 0) throw new Error("Invalid email or password");

          const foundUser = rows[0];
          if (!foundUser?.password)
            throw new Error("Invalid email or password");
          if (!foundUser.emailVerified)
            throw new Error("Please verify your email first");

          const isValidPassword = await bcrypt.compare(
            passwordInput as string,
            foundUser.password
          );
          if (!isValidPassword) throw new Error("Invalid email or password");

          return {
            id: foundUser.id,
            email: foundUser.email,
            name: foundUser.name,
            image: foundUser.image,
          };
        } catch (error) {
          console.error("Authorization error:", error);
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

  // Keep JWT minimal to avoid oversized cookies
  callbacks: {
    async signIn({ account }) {
      if (account?.provider === "microsoft-entra-id") return true;
      if (account?.provider === "credentials") return true;
      return true;
    },

    async jwt({ token, user }) {
      // Keep only the user id in the JWT (minimizes cookie size)
      if (user?.id) token.sub = user.id;

      // Strip everything else that could bloat the cookie
      delete (token as any).id;
      delete (token as any).roles;
      delete (token as any).accessToken;
      delete (token as any).refreshToken;
      delete (token as any).name;
      delete (token as any).email;
      delete (token as any).picture;

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub as string) || session.user.id;

        // Fetch roles from DB per request (NOT in the JWT)
        const userRoleRows = await db
          .select({ roleName: roles.name })
          .from(userRoles)
          .innerJoin(roles, sql`${userRoles.roleId} = ${roles.id}`)
          .where(sql`${userRoles.userId} = ${token.sub}`);

        session.user.roles = userRoleRows.map((r) => r.roleName);

        // If you *must* send a provider access token to the client (not recommended),
        // read it from the accounts table and assign here.
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },

  // Auto-verify email for Microsoft sign-ins
  // - linkAccount: runs when a provider is linked the first time
  // - signIn: runs on every successful sign-in
  events: {
    async linkAccount({ user, account }) {
      if (account?.provider === "microsoft-entra-id" && user.id) {
        await db
          .update(users)
          .set({ emailVerified: new Date() })
          .where(and(eq(users.id, user.id), isNull(users.emailVerified)));
      }
    },
    async signIn({ user, account }) {
      if (account?.provider === "microsoft-entra-id" && user.id) {
        await db
          .update(users)
          .set({ emailVerified: new Date() })
          .where(and(eq(users.id, user.id), isNull(users.emailVerified)));

        // Save/refresh tokens in DB
        await db
          .update(accounts)
          .set({
            access_token: account.access_token ?? null,
            refresh_token: account.refresh_token ?? null,
            // `expires_at` is seconds-since-epoch (use what your schema expects)
            expires_at:
              (account as any).expires_at ??
              (account.expires_in
                ? Math.floor(Date.now() / 1000) + Number(account.expires_in)
                : null),
            token_type: (account as any).token_type ?? null,
            scope: typeof account.scope === "string" ? account.scope : null,
          })
          .where(
            and(
              eq(accounts.userId, user.id),
              eq(accounts.provider, "microsoft-entra-id")
            )
          );
      }
    },
  },

  // You said you need JWTs—keep them, but keep them *small*
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60,
  },

  // Rotate cookie name to invalidate old oversized cookies on clients
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === "production"
          ? "__Secure-authjs.session-token.v2"
          : "authjs.session-token.v2",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },

  trustHost: true,
  useSecureCookies: process.env.NODE_ENV === "production",
} satisfies NextAuthConfig;
