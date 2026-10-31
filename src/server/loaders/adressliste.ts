// adressliste.ts — data for the /adressliste page.

import "server-only";

import { ADRESSLISTE_ROLES } from "~/lib/roles";
import {
	listMemberStatusOptions,
	listMembers,
} from "~/server/actions/members/members";
import { requirePageRoles } from "./page-access";

const VIEW_ROLES = ADRESSLISTE_ROLES;
const EDIT_ROLES = ADRESSLISTE_ROLES;

export async function loadAdresslistePage() {
	const roleNames = await requirePageRoles(VIEW_ROLES);
	const canEdit = roleNames.some((r) => EDIT_ROLES.includes(r));
	const [members, statusOptions] = await Promise.all([
		listMembers(),
		listMemberStatusOptions(),
	]);
	return {
		members,
		canEdit,
		statusOptions: statusOptions.length > 0 ? statusOptions : undefined,
	};
}
