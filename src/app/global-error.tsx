"use client";

import "~/styles/globals.css";

import type { ErrorInfo } from "next/error";
import { useEffect } from "react";

import { buttonVariants } from "~/components/ui/button";
import { ErrorState } from "~/components/ui/error-state";
import { errorDigest, reportBoundaryError } from "~/lib/error-reporting";

/** next-themes' stored choice, else the OS setting. */
function prefersDark(): boolean {
	try {
		const stored = window.localStorage.getItem("theme");
		if (stored === "dark" || stored === "light") {
			return stored === "dark";
		}
	} catch {
		// Storage can be blocked; fall back to the OS setting.
	}
	return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Last resort when the root layout itself fails. It replaces the whole
// document, so it brings its own <html>, <body>, styles and theme (the
// theme provider lives in the layout that just failed).
export default function GlobalError({ error, retry }: ErrorInfo) {
	useEffect(() => {
		reportBoundaryError(error, {
			boundary: "global",
			global: true,
			path: window.location.pathname,
		});
	}, [error]);

	useEffect(() => {
		document.documentElement.classList.toggle("dark", prefersDark());
	}, []);

	return (
		<html lang="de">
			<body>
				<title>Fehler</title>
				<main className="flex min-h-screen items-center justify-center bg-background text-foreground">
					<ErrorState
						digest={errorDigest(error)}
						onRetry={retry}
						action={
							// A full page load, in case the client router is broken too.
							<a href="/" className={buttonVariants({ variant: "outline" })}>
								Zur Startseite
							</a>
						}
					/>
				</main>
			</body>
		</html>
	);
}
