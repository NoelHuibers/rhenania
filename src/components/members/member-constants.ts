// Client-safe member constants + presentation helpers (no server imports).

export const MEMBER_STATUS_OPTIONS = [
	{ value: "Fuchs", label: "Fuchs" },
	{ value: "CB", label: "CB (Corpsbursche)" },
	{ value: "IaCB", label: "IaCB (Inaktiver CB)" },
	{ value: "IaCBoB", label: "IaCBoB" },
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

export function memberInitials(
	firstName?: string | null,
	lastName?: string | null,
): string {
	const fi = (firstName ?? "").trim().charAt(0);
	const li = (lastName ?? "").trim().charAt(0);
	return (fi + li).toUpperCase() || "?";
}

// Semantic badge colors per status family (free-text tolerant, dark-mode aware).
export function memberStatusClasses(status: string): string {
	const s = (status ?? "").toLowerCase().replace(/[^a-z]/g, "");
	if (s.startsWith("fuchs") || s.startsWith("fux"))
		return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300";
	if (s.startsWith("iacb"))
		return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300";
	if (s.startsWith("cb"))
		return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300";
	if (s.startsWith("ah"))
		return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-400/25 dark:bg-slate-400/10 dark:text-slate-300";
	return "border-border bg-muted text-muted-foreground";
}

const AVATAR_PALETTE = [
	"bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
	"bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
	"bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
	"bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
	"bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
	"bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
];

// Deterministic avatar tint from the member's name (stable across renders).
export function avatarColorClasses(seed: string): string {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
	return AVATAR_PALETTE[h % AVATAR_PALETTE.length] as string;
}
