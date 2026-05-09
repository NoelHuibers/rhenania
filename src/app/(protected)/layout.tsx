// layout.tsx
import { Toaster } from "sonner";
import { TenantProvider } from "~/components/TenantProvider";
import { ThemeProvider } from "~/components/theme-provider";
import { getCurrentTenant } from "~/server/lib/tenant-context";

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const tenant = await getCurrentTenant();
	const tenantValue = {
		slug: tenant?.slug ?? "",
		displayName: tenant?.displayName ?? "Corps",
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
