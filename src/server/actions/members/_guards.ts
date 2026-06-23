// Shared role guards for the Mitglieder / Semesterbeitrag actions.
// Reuses the auth helpers from the CC-Kasse guards.

export { requireAuth, requireRoles } from "~/server/actions/cc-kasse/_guards";

// Senior + Subsenior + Admin manage the member directory.
export const MEMBER_EDIT_ROLES = ["Senior", "Subsenior", "Admin"];
// CC-Kasse may additionally view the directory (for letters / Beiträge).
export const MEMBER_VIEW_ROLES = ["Senior", "Subsenior", "Admin", "CC-Kasse"];
// CC-Kasse + Admin run the Semesterbeitrag.
export const BEITRAG_ROLES = ["CC-Kasse", "Admin"];

export const MEMBER_STATUSES = ["Fuchs", "CB", "IaCB", "AH", "AHEB"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];
// Statuses that owe the Semesterbeitrag.
export const BEITRAGSPFLICHTIG_STATUSES: MemberStatus[] = [
	"Fuchs",
	"CB",
	"IaCB",
];

export function isBeitragspflichtig(status: string): boolean {
	return (BEITRAGSPFLICHTIG_STATUSES as string[]).includes(status);
}
