// Shared role guards for CC-Kasse server actions.
// Not a server-action module itself — only imported by the action files.

import { hasAnyRole } from "~/server/actions/admin/userRoles";
import { auth } from "~/server/auth";

// Senior + CC-Kasse + Admin may edit the Etaplan / Kostenpunkte.
export const EDIT_ROLES = ["Senior", "CC-Kasse", "Admin"];
// Only CC-Kasse + Admin may approve / pay / book reimbursements.
export const TREASURY_ROLES = ["CC-Kasse", "Admin"];

type GuardResult = { ok: true; userId: string } | { ok: false; error: string };

export async function requireAuth(): Promise<GuardResult> {
	const session = await auth();
	const userId = session?.user?.id;
	if (!userId) return { ok: false, error: "Nicht angemeldet" };
	return { ok: true, userId };
}

export async function requireRoles(roles: string[]): Promise<GuardResult> {
	const session = await auth();
	const userId = session?.user?.id;
	if (!userId) return { ok: false, error: "Nicht angemeldet" };
	if (!(await hasAnyRole(userId, roles))) {
		return { ok: false, error: "Keine Berechtigung" };
	}
	return { ok: true, userId };
}
