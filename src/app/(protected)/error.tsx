"use client";

import type { ErrorInfo } from "next/error";

import { RouteError } from "~/components/errors/RouteError";

// Inside the app shell: the sidebar stays usable, only the page is replaced.
export default function ProtectedError({ error, retry }: ErrorInfo) {
	return (
		<RouteError
			error={error}
			retry={retry}
			boundary="protected"
			home={{ href: "/trinken", label: "Zur Getränkekarte" }}
		/>
	);
}
