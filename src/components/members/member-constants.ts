// Client-safe member constants (no server imports).

export const MEMBER_STATUS_OPTIONS = [
	{ value: "Fuchs", label: "Fuchs" },
	{ value: "CB", label: "CB (Corpsbursche)" },
	{ value: "IaCB", label: "IaCB (Inaktiver CB)" },
	{ value: "AH", label: "AH (Alter Herr)" },
	{ value: "AHEB", label: "AHEB" },
] as const;

export type MemberStatusValue = (typeof MEMBER_STATUS_OPTIONS)[number]["value"];

export const BEITRAGSPFLICHTIG_STATUSES = ["Fuchs", "CB", "IaCB"];

export function formatMemberAddress(m: {
	street?: string | null;
	houseNumber?: string | null;
	addressLine2?: string | null;
	postalCode?: string | null;
	city?: string | null;
}): string {
	const line1 = [m.street, m.houseNumber].filter(Boolean).join(" ");
	const line3 = [m.postalCode, m.city].filter(Boolean).join(" ");
	return [line1, m.addressLine2, line3].filter(Boolean).join(", ");
}
