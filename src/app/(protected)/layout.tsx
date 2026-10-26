import type { Metadata } from "next";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { TenantProvider } from "~/components/TenantProvider";
import { defaultFeatureFlags } from "~/lib/features";
import { getCurrentTenant } from "~/server/lib/tenant-context";

export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

// The sidebar is mounted here, once, so it keeps its open state and scroll
// position while the member navigates between pages.
export default async function ProtectedLayout({
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
		<TenantProvider value={tenantValue}>
			<SidebarLayout>{children}</SidebarLayout>
		</TenantProvider>
	);
}
