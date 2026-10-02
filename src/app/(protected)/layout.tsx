// layout.tsx
import type { Metadata } from "next";
import { Toaster } from "sonner";
import { TenantProvider } from "~/components/TenantProvider";
import { ThemeProvider } from "~/components/theme-provider";
import { defaultFeatureFlags } from "~/lib/features";
import { getCurrentTenant } from "~/server/lib/tenant-context";

export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const tenant = await getCurrentTenant();
	const tenantValue = {
		slug: tenant?.slug ?? "",
		displayName: tenant?.displayName ?? "Corps",
		features: tenant?.features ?? defaultFeatureFlags(),
	};

	return (
		<html lang="de" suppressHydrationWarning>
			<body>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
				>
					<TenantProvider value={tenantValue}>{children}</TenantProvider>
					<Toaster position="bottom-right" richColors closeButton />
				</ThemeProvider>
			</body>
		</html>
	);
}
