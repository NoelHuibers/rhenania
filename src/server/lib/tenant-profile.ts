// tenant-profile.ts — a tenant's public identity, read from its branding.
//
// Name, address, contact data and SemPro texts used to be Rhenania literals in
// shared code (#36). They now come from the control-DB tenant record: the
// display name, plus the optional fields of the JSON `branding` column. A
// missing value is left out (or replaced by a neutral text), never filled with
// another Corps' data.

import type {
	TenantBranding,
	TenantSemproBranding,
} from "~/server/db/control-schema";
import {
	getCurrentTenant,
	type TenantContext,
} from "~/server/lib/tenant-context";

/** Shown where a tenant name is needed but no tenant is known. */
export const NEUTRAL_TENANT_NAME = "Corps";

export type TenantProfile = {
	displayName: string;
	/** Full name for the Impressum and documents (fallback: displayName). */
	legalName: string;
	street: string | null;
	city: string | null;
	phone: string | null;
	contactEmail: string | null;
	/** Who runs the website; null when not stored. */
	operator: string | null;
	representative: string | null;
	instagramUrl: string | null;
	wikipediaUrl: string | null;
};

type TenantLike = Pick<TenantContext, "displayName" | "branding"> | null;

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** Only absolute http(s) links, so a stored value can never run script. */
function httpUrl(value: unknown): string | null {
	const url = text(value);
	return url && /^https?:\/\//i.test(url) ? url : null;
}

/** Only a plain address, used in `mailto:` links. */
function email(value: unknown): string | null {
	const address = text(value);
	return address && /^[^\s@<>"]+@[^\s@<>"]+$/.test(address) ? address : null;
}

export function tenantProfile(tenant: TenantLike): TenantProfile {
	const branding: TenantBranding = tenant?.branding ?? {};
	const displayName = text(tenant?.displayName) ?? NEUTRAL_TENANT_NAME;
	return {
		displayName,
		legalName: text(branding.legalName) ?? displayName,
		street: text(branding.street),
		city: text(branding.city),
		phone: text(branding.phone),
		contactEmail: email(branding.contactEmail),
		operator: text(branding.operator),
		representative: text(branding.representative),
		instagramUrl: httpUrl(branding.instagramUrl),
		wikipediaUrl: httpUrl(branding.wikipediaUrl),
	};
}

/** The current request's tenant profile (neutral when there is no tenant). */
export async function getTenantProfile(): Promise<TenantProfile> {
	return tenantProfile(await getCurrentTenant());
}

/** "Street, City" with whatever parts are stored, or null. */
export function addressLine(profile: TenantProfile): string | null {
	const parts = [profile.street, profile.city].filter(Boolean);
	return parts.length > 0 ? parts.join(", ") : null;
}

/** `tel:` target for a displayed phone number. */
export function phoneHref(phone: string): string {
	return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Month and day of the "MM-DD" founding day, or null when unset/invalid. */
export function parseFoundingDay(
	value: unknown,
): { month: number; day: number } | null {
	const match = /^(\d{2})-(\d{2})$/.exec(text(value) ?? "");
	if (!match) {
		return null;
	}
	const month = Number(match[1]);
	const day = Number(match[2]);
	const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	if (
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > (daysInMonth[month - 1] ?? 0)
	) {
		return null;
	}
	return { month, day };
}

export type SemproProfile = {
	/** Letterhead name. */
	name: string;
	/** Author in the PDF metadata. */
	author: string;
	/** Cover text for the given semester name. */
	intro: (semesterName: string) => string;
	contactLines: string[];
	stammtischName: string;
	/** File name in `public/sempro/`, or null for no coat of arms. */
	logoFile: string | null;
};

const DEFAULT_INTRO =
	"Zum {semester} erlaubt\nsich der CC, das\nSemesterprogramm zu überreichen\nund zu allen Veranstaltungen herzlich\neinzuladen.";

export function semproProfile(tenant: TenantLike): SemproProfile {
	const profile = tenantProfile(tenant);
	const sempro: TenantSemproBranding = tenant?.branding?.sempro ?? {};
	const storedLines = Array.isArray(sempro.contactLines)
		? sempro.contactLines.map(text).filter((l): l is string => l !== null)
		: [];
	const contactLines =
		storedLines.length > 0
			? storedLines
			: [
					profile.street,
					profile.city,
					profile.phone && `Tel.: ${profile.phone}`,
					profile.contactEmail,
				].filter((l): l is string => Boolean(l));
	const intro = text(sempro.intro) ?? DEFAULT_INTRO;
	const logoFile = text(sempro.logoFile);
	return {
		name: text(sempro.name) ?? profile.displayName,
		author: profile.legalName,
		intro: (semesterName) => intro.replaceAll("{semester}", semesterName),
		contactLines,
		stammtischName: text(sempro.stammtischName) ?? "Stammtisch",
		// A bare PNG file name only: the value becomes a path on disk.
		logoFile:
			logoFile && /^[\w-][\w .-]*\.png$/i.test(logoFile) ? logoFile : null,
	};
}
