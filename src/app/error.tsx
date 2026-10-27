"use client";

import type { ErrorInfo } from "next/error";

import { RouteError } from "~/components/errors/RouteError";

// Catches what the route-group boundaries do not (e.g. /access-denied).
// Errors in the root layout itself go to global-error.tsx.
export default function RootError({ error, retry }: ErrorInfo) {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background">
			<RouteError error={error} retry={retry} boundary="root" />
		</main>
	);
}
