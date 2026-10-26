"use client";

import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({
	children,
	...props
}: ComponentProps<typeof NextThemesProvider>) {
	return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

// The public marketing pages (landing page, contact, legal) are designed for
// a light background only; everything else (app, sign-in, superadmin) follows
// the member's theme.
const LIGHT_ONLY =
	/^\/(contact|datenschutz|impressum|studentenverbindung-stuttgart|studentenzimmer-stuttgart)?\/?$/;

export function isLightOnlyPath(pathname: string): boolean {
	return LIGHT_ONLY.test(pathname);
}

/** The one theme provider, mounted by the root layout. */
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
			forcedTheme={isLightOnlyPath(pathname ?? "") ? "light" : undefined}
		>
			{children}
		</ThemeProvider>
	);
}
