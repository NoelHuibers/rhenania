import type { Metadata } from "next";

export const RHENANIA_SITE_URL = "https://www.rhenania-stuttgart.de";
export const RHENANIA_NAME = "Corps Rhenania Stuttgart";

const OG_IMAGE = {
	url: `${RHENANIA_SITE_URL}/stifi.jpg`,
	width: 1600,
	height: 825,
	alt: "Mitglieder des Corps Rhenania Stuttgart",
};

type MetadataInput = {
	title: string;
	description: string;
	path: "/" | `/${string}`;
};

export function createRhenaniaMetadata({
	title,
	description,
	path,
}: MetadataInput): Metadata {
	const canonical = `${RHENANIA_SITE_URL}${path}`;

	return {
		title: { absolute: title },
		description,
		applicationName: RHENANIA_NAME,
		creator: RHENANIA_NAME,
		publisher: RHENANIA_NAME,
		alternates: { canonical },
		openGraph: {
			type: "website",
			locale: "de_DE",
			url: canonical,
			siteName: RHENANIA_NAME,
			title,
			description,
			images: [OG_IMAGE],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [OG_IMAGE.url],
		},
		robots: {
			index: true,
			follow: true,
			googleBot: {
				index: true,
				follow: true,
				"max-image-preview": "large",
				"max-snippet": -1,
				"max-video-preview": -1,
			},
		},
	};
}

export const RHENANIA_ORGANIZATION_JSON_LD = {
	"@type": "Organization",
	"@id": `${RHENANIA_SITE_URL}/#organization`,
	name: RHENANIA_NAME,
	alternateName: "Corps Rhenania",
	url: `${RHENANIA_SITE_URL}/`,
	logo: `${RHENANIA_SITE_URL}/zirkel.svg`,
	image: OG_IMAGE.url,
	foundingDate: "1859",
	email: "corps@rhenania-stuttgart.de",
	telephone: "+49 711 297308",
	address: {
		"@type": "PostalAddress",
		streetAddress: "Relenbergstraße 8",
		postalCode: "70174",
		addressLocality: "Stuttgart",
		addressCountry: "DE",
	},
	sameAs: [
		"https://www.instagram.com/corps.rhenania/",
		"https://de.wikipedia.org/wiki/Corps_Rhenania_Stuttgart",
	],
};

export const RHENANIA_HOME_JSON_LD = {
	"@context": "https://schema.org",
	"@graph": [
		RHENANIA_ORGANIZATION_JSON_LD,
		{
			"@type": "WebSite",
			"@id": `${RHENANIA_SITE_URL}/#website`,
			url: `${RHENANIA_SITE_URL}/`,
			name: RHENANIA_NAME,
			inLanguage: "de-DE",
			publisher: { "@id": `${RHENANIA_SITE_URL}/#organization` },
		},
	],
};

export type FaqItem = {
	question: string;
	answer: string;
};

export function createFaqJsonLd(items: readonly FaqItem[]) {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: items.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: item.answer,
			},
		})),
	};
}

export function createBreadcrumbJsonLd(
	items: readonly { name: string; path: "/" | `/${string}` }[],
) {
	return {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: items.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: `${RHENANIA_SITE_URL}${item.path}`,
		})),
	};
}

function serializeJsonLd(data: unknown) {
	return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function JsonLd({ id, data }: { id: string; data: unknown }) {
	return (
		<script
			id={id}
			type="application/ld+json"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD is serialized and escapes opening angle brackets.
			dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
		/>
	);
}
