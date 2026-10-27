"use client";

import type { ErrorInfo } from "next/error";

import { RouteError } from "~/components/errors/RouteError";

// Inside the superadmin header; the digest matches the server log line.
export default function SuperadminError({ error, retry }: ErrorInfo) {
	return (
		<RouteError
			error={error}
			retry={retry}
			boundary="superadmin"
			home={{ href: "/superadmin", label: "Zur Mandantenübersicht" }}
		/>
	);
}
