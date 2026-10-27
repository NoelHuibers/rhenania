import "~/styles/globals.css";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";
import { AppThemeProvider } from "~/components/theme-provider";
import { Toaster } from "~/components/ui/sonner";
import { cn } from "~/lib/utils";
import { getCurrentTenant } from "~/server/lib/tenant-context";

// One next/font call per family. Inter is the text face, Geist the heading
// face. They set their own variables; `globals.css` builds the Tailwind
// `--font-sans` / `--font-heading` stacks (with system fallbacks) on top.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export async function generateMetadata(): Promise<Metadata> {
	const tenant = await getCurrentTenant();
	const name = tenant?.displayName ?? "Corps";
	return {
		// Pages set plain titles ("Adressliste"); the template brands them
		// per-tenant ("Adressliste – Corps Hassia Darmstadt").
		title: { default: name, template: `%s – ${name}` },
		description: name,
		icons: [{ rel: "icon", url: "/favicon.ico" }],
		formatDetection: { telephone: false },
	};
}

// The only document root. Nested layouts render fragments, never <html> or
// <body>, so the theme class and `lang` always land on the real element.
export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			lang="de"
			// next-themes sets the theme class before hydration.
			suppressHydrationWarning
			className={cn(inter.variable, geist.variable, "font-sans")}
		>
			<body>
				<AppThemeProvider>
					{children}
					{/* Top-center keeps toasts clear of the thumb zone on phones. */}
					<Toaster position="top-center" richColors closeButton />
				</AppThemeProvider>
				<Analytics />
				<SpeedInsights />
			</body>
		</html>
	);
}
