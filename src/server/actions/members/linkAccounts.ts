"use server";

import { revalidatePath } from "next/cache";
import { MEMBER_EDIT_ROLES, requireRoles } from "./_guards";
import { applyLink, computeLinkablePairs } from "./link-helpers";

// Manual resync: sweep all unlinked members and attach accounts with
// unambiguous email matches (any of email/email2/email3). Safe to run any
// time — never relinks or overwrites an existing link.
export async function relinkMemberAccounts() {
	const guard = await requireRoles(MEMBER_EDIT_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	try {
		const { pairs, ambiguous } = await computeLinkablePairs();
		for (const p of pairs) {
			await applyLink(p.memberId, p.userId);
		}
		if (pairs.length > 0) revalidatePath("/adressliste");
		return {
			success: true as const,
			linked: pairs.length,
			ambiguous,
			linkedNames: pairs.map((p) => p.name),
		};
	} catch (error) {
		console.error("Error relinking member accounts:", error);
		return { success: false as const, error: "Fehler beim Verknüpfen" };
	}
}
