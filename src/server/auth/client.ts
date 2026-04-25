"use client";

import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
	baseURL:
		typeof window !== "undefined"
			? window.location.origin
			: (process.env.BETTER_AUTH_URL ?? ""),
	plugins: [genericOAuthClient()],
});

export const { useSession, signIn, signOut } = authClient;
