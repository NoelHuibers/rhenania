import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "~/server/lib/tenant-context";
import {
	RhenaniaStudentenverbindungPage,
	STUDENTENVERBINDUNG_METADATA,
} from "~/tenants/rhenania/studentenverbindung-page";

// A Rhenania-only page: every other tenant gets a 404 without its metadata.
export async function generateMetadata(): Promise<Metadata> {
	const tenant = await getCurrentTenant();
	return tenant?.slug === "rhenania" ? STUDENTENVERBINDUNG_METADATA : {};
}

export default async function Page() {
	const tenant = await getCurrentTenant();
	if (tenant?.slug !== "rhenania") {
		notFound();
	}
	return <RhenaniaStudentenverbindungPage displayName={tenant.displayName} />;
}
