"use server";

// actions.ts — the Adressliste's server actions and the caller's own member
// entry (#33): check the caller and the input, then one call to the members
// service. The reads for the pages answer a caller without the right with
// nothing, as before; changes are defineActions answering with an
// ActionResult.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthzError, ROLES, requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { scopeOf } from "~/server/lib/tenant-scope";
import * as excel from "./excel";
import * as members from "./service";

export type { MemberListItem } from "./service";

/**
 * The caller and their scope if they hold one of `roles` (any member when
 * omitted), or null: the page reads answer a denied caller with nothing.
 */
async function requireRoles(roles?: readonly string[]) {
	try {
		const { member, tenantId } = await requireCaller(roles);
		return { member, tenant: await scopeOf(tenantId) };
	} catch (error) {
		if (error instanceof AuthzError) {
			return null;
		}
		throw error;
	}
}

// ─── The Adressliste ─────────────────────────────────────────────────────────

/** Every member, for Admins and the AHV board. */
export async function listMembers() {
	const caller = await requireRoles(ROLES.adressliste);
	return caller ? members.directory(caller.tenant) : [];
}

/** The status options of the Adressliste dropdowns (defaults if not seeded). */
export async function listMemberStatusOptions(): Promise<
	{ value: string; label: string }[]
> {
	// Signed-out callers get an error, members without the right nothing.
	const { member, tenantId } = await requireCaller();
	if (!ROLES.adressliste.some((role) => member.roles.includes(role))) {
		return [];
	}
	return members.statusOptions(await scopeOf(tenantId));
}

const edit = {
	roles: ROLES.adressliste,
	revalidate: ["/adressliste"],
} as const;

export const createMember = defineAction(
	{
		...edit,
		schema: z.tuple([members.memberInputSchema]),
		errorMessage: "Fehler beim Erstellen",
	},
	async ([input], { tenant, user }) =>
		members.createMember(tenant, user, input),
);

export const updateMember = defineAction(
	{
		...edit,
		schema: z.tuple([z.string(), members.memberInputSchema]),
		errorMessage: "Fehler beim Speichern",
	},
	async ([memberId, input], { tenant, user }) =>
		members.updateMember(tenant, user, memberId, input),
);

/** Partial update for in-place table editing (one or more fields). */
export const updateMemberFields = defineAction(
	{
		...edit,
		schema: z.tuple([z.string(), members.editableFieldsSchema]),
		errorMessage: "Fehler beim Speichern",
	},
	async ([memberId, patch], { tenant, user }) =>
		members.updateMemberFields(tenant, user, memberId, patch),
);

export const deleteMember = defineAction(
	{
		...edit,
		schema: z.tuple([z.string()]),
		errorMessage: "Fehler beim Löschen",
	},
	async ([memberId], { tenant }) => members.deleteMember(tenant, memberId),
);

/**
 * Manual resync: links every unlinked member to the account its emails
 * match unambiguously. Safe to run any time — never relinks or overwrites
 * an existing link.
 */
export const relinkMemberAccounts = defineAction(
	{ roles: ROLES.adressliste, errorMessage: "Fehler beim Verknüpfen" },
	async ({ tenant }) => {
		const result = await members.relinkAll(tenant);
		if (result.linked > 0) {
			revalidatePath("/adressliste");
		}
		return result;
	},
);

export const exportMembersXlsx = defineAction(
	{ roles: ROLES.adressliste, errorMessage: "Export fehlgeschlagen" },
	async ({ tenant }) => excel.exportXlsx(tenant),
);

export const importMembersXlsx = defineAction(
	{
		...edit,
		schema: z.tuple([z.object({ base64: z.string() })]),
		errorMessage: "Import fehlgeschlagen",
	},
	async ([input], { tenant, user }) =>
		excel.importXlsx(tenant, user, input.base64),
);

// ─── The caller's own entry (/profile) ───────────────────────────────────────

/** The caller's member row, linked by email on first use; null if none. */
export async function getMyMember() {
	const caller = await requireRoles();
	return caller ? members.myMember(caller.tenant, caller.member) : null;
}

/** Saves the caller's own entry (not the status or "Adresse veraltet"). */
export const updateMyMember = defineAction(
	{
		schema: z.tuple([members.selfSchema]),
		revalidate: ["/profile"],
		errorMessage: "Fehler beim Speichern",
	},
	async ([input], { tenant, user }) =>
		members.updateMyMember(tenant, user, input),
);
