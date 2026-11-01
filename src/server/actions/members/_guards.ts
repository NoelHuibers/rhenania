// Shared role guards for the Semesterbeitrag actions.
// Reuses the auth helpers from the CC-Kasse guards.

export { requireRoles } from "~/server/actions/cc-kasse/_guards";

// CC-Kasse + Admin run the Semesterbeitrag.
export const BEITRAG_ROLES = ["CC-Kasse", "Admin"];
