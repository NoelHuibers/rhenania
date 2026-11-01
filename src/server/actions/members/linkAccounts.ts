"use server";

import { revalidatePath } from "next/cache";
import { defineAction } from "~/server/lib/define-action";
import { MEMBER_EDIT_ROLES } from "./_guards";
import { applyLink, computeLinkablePairs } from "./link-helpers";

// Manual resync: sweep all unlinked members and attach accounts with
// unambiguous email matches (any of email/email2/email3). Safe to run any
// time — never relinks or overwrites an existing link.
export const relinkMemberAccounts = defineAction(
	{ roles: MEMBER_EDIT_ROLES, errorMessage: "Fehler beim Verknüpfen" },
	async () => {
		const { pairs, ambiguous } = await computeLinkablePairs();
		for (const p of pairs) {
			await applyLink(p.memberId, p.userId);
		}
		if (pairs.length > 0) {
			revalidatePath("/adressliste");
		}
		return {
			linked: pairs.length,
			ambiguous,
			linkedNames: pairs.map((p) => p.name),
		};
	},
);
