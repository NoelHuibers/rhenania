// Shared role guards for the Mitglieder / Semesterbeitrag actions.
// Reuses the auth helpers from the CC-Kasse guards.

import { ADRESSLISTE_ROLES } from "~/lib/roles";

export { requireAuth, requireRoles } from "~/server/actions/cc-kasse/_guards";

// Only Admins and the AHV Vorstand may view + edit the member directory.
export const MEMBER_EDIT_ROLES = ADRESSLISTE_ROLES;
export const MEMBER_VIEW_ROLES = ADRESSLISTE_ROLES;
// CC-Kasse + Admin run the Semesterbeitrag.
export const BEITRAG_ROLES = ["CC-Kasse", "Admin"];

// Member statuses moved to the per-tenant `member_status` config table —
// see ~/server/lib/member-statuses.ts (getTenantMemberStatuses +
// makeBeitragspflichtigMatcher).
