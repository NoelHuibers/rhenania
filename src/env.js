// Update your existing env.js file to add NEXTAUTH_URL

import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		AUTH_SECRET:
			process.env.NODE_ENV === "production"
				? z.string()
				: z.string().optional(),
		BETTER_AUTH_URL: z.string().url(),
		GMAIL: z.string().email().optional(),
		GMAIL_PASSWORD: z.string().optional(),
		TOMAIL: z.string().email().optional(),
		DATABASE_URL: z.string().url(),
		DATABASE_AUTH_TOKEN: z.string().optional(),
		CONTROL_DATABASE_URL: z.string().url(),
		CONTROL_DATABASE_AUTH_TOKEN: z.string().optional(),
		TURSO_PLATFORM_TOKEN: z.string().optional(),
		TURSO_ORG_SLUG: z.string().optional(),
		TURSO_GROUP: z.string().default("corps"),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
	},
	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {
		// NEXT_PUBLIC_CLIENTVAR: z.string(),
	},
	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		AUTH_SECRET: process.env.AUTH_SECRET,
		BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
		GMAIL: process.env.GMAIL,
		GMAIL_PASSWORD: process.env.GMAIL_PASSWORD,
		TOMAIL: process.env.TOMAIL,
		DATABASE_URL: process.env.DATABASE_URL,
		DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
		CONTROL_DATABASE_URL: process.env.CONTROL_DATABASE_URL,
		CONTROL_DATABASE_AUTH_TOKEN: process.env.CONTROL_DATABASE_AUTH_TOKEN,
		TURSO_PLATFORM_TOKEN: process.env.TURSO_PLATFORM_TOKEN,
		TURSO_ORG_SLUG: process.env.TURSO_ORG_SLUG,
		TURSO_GROUP: process.env.TURSO_GROUP,
		NODE_ENV: process.env.NODE_ENV,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});

// Add this to your .env.local file:
// NEXTAUTH_URL=http://localhost:3000
