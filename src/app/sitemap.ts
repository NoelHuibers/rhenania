import type { MetadataRoute } from "next";
import {
	getCurrentRequestOrigin,
	getCurrentTenant,
} from "~/server/lib/tenant-context";

export const dynamic = "force-dynamic";

type SitemapPage = {
	path: string;
	changeFrequency: NonNullable<
		MetadataRoute.Sitemap[number]["changeFrequency"]
	>;
	priority: number;
};

const HOME_PAGE: SitemapPage = {
	path: "/",
	changeFrequency: "weekly",
	priority: 1,
};
const CONTACT_PAGE: SitemapPage = {
	path: "/contact",
	changeFrequency: "yearly",
	priority: 0.5,
};

const DEFAULT_PAGES: SitemapPage[] = [HOME_PAGE, CONTACT_PAGE];

const RHENANIA_PAGES: SitemapPage[] = [
	HOME_PAGE,
	{
		path: "/studentenzimmer-stuttgart",
		changeFrequency: "weekly",
		priority: 0.9,
	},
	{
		path: "/studentenverbindung-stuttgart",
		changeFrequency: "monthly",
		priority: 0.9,
	},
	CONTACT_PAGE,
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const [tenant, requestOrigin] = await Promise.all([
		getCurrentTenant(),
		getCurrentRequestOrigin(),
	]);
	const origin = requestOrigin.replace(/\/$/, "");
	const pages = tenant?.slug === "rhenania" ? RHENANIA_PAGES : DEFAULT_PAGES;

	return pages.map(({ path, changeFrequency, priority }) => ({
		url: `${origin}${path}`,
		changeFrequency,
		priority,
	}));
}
