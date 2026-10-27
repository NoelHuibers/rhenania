"use client";

import type { ErrorInfo } from "next/error";

import { RouteError } from "~/components/errors/RouteError";

// Sign-in, password reset and e-mail verification.
export default function AuthError({ error, retry }: ErrorInfo) {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background">
			<RouteError error={error} retry={retry} boundary="auth" />
		</main>
	);
}
