import { eq } from "drizzle-orm";
import { Suspense } from "react";

import SignInPage from "~/components/auth/SignInPage";
import { microsoftProviderIdForSlug } from "~/server/auth/load-providers";
import { controlDb } from "~/server/db/control";
import { tenantAuthConfig, tenants } from "~/server/db/control-schema";
import { getTenantId } from "~/server/lib/tenant-context";

async function resolveMicrosoftProviderId(): Promise<string | null> {
	const tenantId = await getTenantId();
	if (!tenantId) return null;

	const [row] = await controlDb
		.select({
			slug: tenants.slug,
			microsoftEnabled: tenantAuthConfig.microsoftEnabled,
			azureClientId: tenantAuthConfig.azureClientId,
		})
		.from(tenants)
		.leftJoin(tenantAuthConfig, eq(tenantAuthConfig.tenantId, tenants.id))
		.where(eq(tenants.id, tenantId))
		.limit(1);

	if (!row?.microsoftEnabled || !row.azureClientId) return null;
	return microsoftProviderIdForSlug(row.slug);
}

export default async function Page() {
	const microsoftProviderId = await resolveMicrosoftProviderId();
	return (
		<Suspense fallback={<div />}>
			<SignInPage microsoftProviderId={microsoftProviderId} />
		</Suspense>
	);
}
