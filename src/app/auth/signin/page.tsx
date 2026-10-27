import { Suspense } from "react";

import { SignInPage } from "~/components/auth/SignInPage";
import { microsoftProviderFor } from "~/server/auth/load-providers";
import { getTenantConfig } from "~/server/lib/tenant-config";
import { getTenantId } from "~/server/lib/tenant-context";

/** The Microsoft provider this tenant's Better Auth instance registers, if any. */
async function resolveMicrosoftProviderId(): Promise<string | null> {
	const tenantId = await getTenantId();
	const config = tenantId ? await getTenantConfig(tenantId) : null;
	return config ? (microsoftProviderFor(config)?.providerId ?? null) : null;
}

export default async function Page() {
	const microsoftProviderId = await resolveMicrosoftProviderId();
	return (
		<Suspense fallback={<div />}>
			<SignInPage microsoftProviderId={microsoftProviderId} />
		</Suspense>
	);
}
