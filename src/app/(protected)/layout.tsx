import type { Metadata } from "next";
import { TenantProvider } from "~/components/TenantProvider";
import { defaultFeatureFlags } from "~/lib/features";
import { getCurrentTenant } from "~/server/lib/tenant-context";

export const metadata: Metadata = {
	robots: { index: false, follow: false },
};

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

	return <TenantProvider value={tenantValue}>{children}</TenantProvider>;
}
