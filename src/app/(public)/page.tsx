import { getCurrentTenant } from "~/server/lib/tenant-context";
import DefaultLandingPage from "~/tenants/default/landing-page";
import RhenaniaLandingPage from "~/tenants/rhenania/landing-page";

// Public landing page dispatcher.
//
// Pick the per-corps landing component by tenant slug. Add a new entry here
// when a corps gets its own custom page under `src/tenants/<slug>/`.
// Anything not registered falls back to the default welcome page.
export default async function HomePage() {
	const tenant = await getCurrentTenant();

	switch (tenant?.slug) {
		case "rhenania":
			return <RhenaniaLandingPage />;
		default:
			return <DefaultLandingPage />;
	}
}
