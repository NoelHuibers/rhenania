"use client";

import { Home } from "lucide-react";
import Link from "next/link";

import { Button } from "~/components/ui/button";
import { ErrorState } from "~/components/ui/error-state";
import { errorDigest } from "~/lib/error-reporting";

type RouteErrorProps = {
	error: unknown;
	retry: () => void;
	/** Which error.tsx caught it ("protected", "auth" …). */
	boundary: string;
	/** A way out when retrying does not help; `null` hides the link. */
	home?: { href: string; label: string } | null;
	className?: string;
};

/**
 * The body of every error.tsx: a German, recoverable error screen with the
 * digest. The error's message and stack are never rendered.
 */
export function RouteError({
	error,
	retry,
	home = { href: "/", label: "Zur Startseite" },
	className,
}: RouteErrorProps) {
	return (
		<ErrorState
			digest={errorDigest(error)}
			onRetry={retry}
			className={className}
			action={
				home ? (
					<Button asChild variant="outline">
						<Link href={home.href}>
							<Home />
							{home.label}
						</Link>
					</Button>
				) : undefined
			}
		/>
	);
}
