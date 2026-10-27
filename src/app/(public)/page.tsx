import type { Metadata } from "next";
import { getCurrentTenant } from "~/server/lib/tenant-context";
import { DefaultLandingPage } from "~/tenants/default/landing-page";
import { RhenaniaLandingPage } from "~/tenants/rhenania/landing-page";
import {
	JsonLd,
	RHENANIA_HOME_JSON_LD,
	RHENANIA_HOME_METADATA,
} from "~/tenants/rhenania/seo";

export async function generateMetadata(): Promise<Metadata> {
	const tenant = await getCurrentTenant();
	if (tenant?.slug !== "rhenania") {
		return {};
	}

	return RHENANIA_HOME_METADATA;
}

// Public landing page dispatcher.
//
// Pick the per-corps landing component by tenant slug. Add a new entry here
// when a corps gets its own custom page under `src/tenants/<slug>/`.
// Anything not registered falls back to the default welcome page.
export default async function HomePage() {
	const tenant = await getCurrentTenant();

	switch (tenant?.slug) {
		case "rhenania":
			return (
				<>
					<JsonLd id="rhenania-organization" data={RHENANIA_HOME_JSON_LD} />
					<RhenaniaLandingPage />
				</>
			);
		default:
			return <DefaultLandingPage />;
	}
}
