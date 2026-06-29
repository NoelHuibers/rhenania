// Shared role guards for the Mitglieder / Semesterbeitrag actions.
// Reuses the auth helpers from the CC-Kasse guards.

export { requireAuth, requireRoles } from "~/server/actions/cc-kasse/_guards";

// Senior + Subsenior + Admin manage the member directory.
export const MEMBER_EDIT_ROLES = ["Senior", "Subsenior", "Admin"];
// CC-Kasse may additionally view the directory (for letters / Beiträge).
export const MEMBER_VIEW_ROLES = ["Senior", "Subsenior", "Admin", "CC-Kasse"];
// CC-Kasse + Admin run the Semesterbeitrag.
export const BEITRAG_ROLES = ["CC-Kasse", "Admin"];

// Canonical statuses (for the dialog dropdown); the column is free text, so the
// imported spreadsheet may contain variants (iaCBoB, AH idC, FCK, …).
export const MEMBER_STATUSES = ["Fuchs", "CB", "IaCB", "AH", "AHEB"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

// Beitragspflichtig = active members (Fuchs / CB / IaCB and their variants),
// NOT Alte Herren (AH / AHEB / "AH idC"). Variant-tolerant.
export function isBeitragspflichtig(
	status: string | null | undefined,
): boolean {
	const s = (status ?? "").toLowerCase().replace(/[^a-z]/g, "");
	if (!s) return false;
	if (s.startsWith("ah")) return false;
	return (
		s.startsWith("fuchs") ||
		s.startsWith("fux") ||
		s.startsWith("cb") ||
		s.startsWith("iacb")
	);
}
