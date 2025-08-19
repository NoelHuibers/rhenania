// config.ts
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
      // If you need extra scopes, uncomment below:
      // authorization: { params: { scope: "openid profile email offline_access" } },
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

  // 🔒 Use a *tiny* JWT: only keep `sub` (user id). Do NOT stash roles/access tokens here.
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

        // Fetch roles from DB at request time (NOT in the JWT)
        const userRoleRows = await db
          .select({ roleName: roles.name })
          .from(userRoles)
          .innerJoin(roles, sql`${userRoles.roleId} = ${roles.id}`)
          .where(sql`${userRoles.userId} = ${token.sub}`);

        session.user.roles = userRoleRows.map((r) => r.roleName);

        // If you *must* send a provider access token to the client (not recommended),
        // read it from the accounts table and assign here:
        // const [acc] = await db
        //  .select()
        //  .from(accounts)
        //  .where(sql`${accounts.userId} = ${token.sub} AND ${accounts.provider} = 'microsoft-entra-id'`)
        //  .limit(1);
        // if (acc?.access_token) session.accessToken = acc.access_token;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      else if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },

  // ✅ You said you need JWTs—keep them, but keep them SMALL.
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60,
  },

  // 🚫 Prevent old, bloated cookies from being reused by rotating the cookie name
  // (After deploying this, clear site cookies in your browser once to drop old chunks)
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
