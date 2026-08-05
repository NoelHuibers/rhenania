import type { MetadataRoute } from "next";
import { getCurrentRequestOrigin } from "~/server/lib/tenant-context";

export const dynamic = "force-dynamic";

const PRIVATE_PATHS = [
	"/api/",
	"/auth/",
	"/access-denied",
	"/profile",
	"/bestellungen",
	"/bilder",
	"/eloranking",
	"/challenges",
	"/rechnungen",
	"/trinken",
	"/fuchsenladen",
	"/fuchsenwart",
	"/fuchsenrechnungen",
	"/fuchsenbestellungen",
	"/leaderboard",
	"/admin",
	"/inventur",
	"/getraenkewart",
	"/semesterprogramm",
	"/konten",
	"/cc-kasse",
	"/kostenerstattung",
	"/adressliste",
	"/superadmin",
];

export default async function robots(): Promise<MetadataRoute.Robots> {
	const origin = (await getCurrentRequestOrigin()).replace(/\/$/, "");

	return {
		rules: {
			userAgent: "*",
			allow: "/",
			disallow: PRIVATE_PATHS,
		},
		sitemap: `${origin}/sitemap.xml`,
	};
}
