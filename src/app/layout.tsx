import "~/styles/globals.css";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";
import { cn } from "~/lib/utils";
import { getCurrentTenant } from "~/server/lib/tenant-context";

const geistHeading = Geist({ subsets: ["latin"], variable: "--font-heading" });

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export async function generateMetadata(): Promise<Metadata> {
	const tenant = await getCurrentTenant();
	const name = tenant?.displayName ?? "Corps";
	return {
		title: name,
		description: name,
		icons: [{ rel: "icon", url: "/favicon.ico" }],
	};
}

const geist = Geist({
	subsets: ["latin"],
	variable: "--font-geist-sans",
});

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html
			lang="en"
			className={cn(
				geist.variable,
				"font-sans",
				inter.variable,
				geistHeading.variable,
			)}
		>
			<body>{children}</body>
			<Analytics />
			<SpeedInsights />
		</html>
	);
}
