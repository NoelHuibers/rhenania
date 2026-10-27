"use client";

import type { ErrorInfo } from "next/error";

import { RouteError } from "~/components/errors/RouteError";

// Public marketing pages (landing page, contact, legal).
export default function PublicError({ error, retry }: ErrorInfo) {
	return (
		<main className="flex min-h-[60vh] items-center justify-center bg-background">
			<RouteError error={error} retry={retry} boundary="public" />
		</main>
	);
}
