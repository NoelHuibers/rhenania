// Shared role guards for CC-Kasse server actions.
// Not a server-action module itself — only imported by the action files.
// Mutations pass these role sets to defineAction; the guards below serve the
// reads that answer a denied caller with nothing instead of an error.

import { auth } from "~/server/auth";

// Senior + CC-Kasse + Admin may edit the Etaplan / Kostenpunkte.
export const EDIT_ROLES = ["Senior", "CC-Kasse", "Admin"];
// Only CC-Kasse + Admin may approve / pay / book reimbursements.
export const TREASURY_ROLES = ["CC-Kasse", "Admin"];

type GuardResult =
	| {
			ok: true;
			userId: string;
			/** The tenant the caller's membership was checked in. */
			tenantId: string;
	  }
	| { ok: false; error: string };

export async function requireAuth(): Promise<GuardResult> {
	const session = await auth();
	const userId = session?.user?.id;
	if (!userId) {
		return { ok: false, error: "Nicht angemeldet" };
	}
	return { ok: true, userId, tenantId: session.tenantId };
}

export async function requireRoles(roles: string[]): Promise<GuardResult> {
	const session = await auth();
	const userId = session?.user?.id;
	if (!userId) {
		return { ok: false, error: "Nicht angemeldet" };
	}
	// Roles from auth() are membership-aware: a suspended or foreign member
	// has none here.
	if (!roles.some((role) => session.user.roles.includes(role))) {
		return { ok: false, error: "Keine Berechtigung" };
	}
	return { ok: true, userId, tenantId: session.tenantId };
}
