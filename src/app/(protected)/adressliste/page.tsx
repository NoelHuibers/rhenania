import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AdresslistePage } from "~/components/members/AdresslistePage";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { ADRESSLISTE_ROLES } from "~/lib/roles";
import {
	listMemberStatusOptions,
	listMembers,
} from "~/server/actions/members/members";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { roles, userRoles } from "~/server/db/schema";

async function getUserRoleNames(userId: string): Promise<string[]> {
	const rows = await db
		.select({ name: roles.name })
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, userId));
	return rows.map((r) => r.name);
}

const VIEW_ROLES = ADRESSLISTE_ROLES;
const EDIT_ROLES = ADRESSLISTE_ROLES;

export default async function AdresslisteRoute() {
	const session = await auth();
	if (!session?.user?.id) redirect("/auth/signin");

	const roleNames = await getUserRoleNames(session.user.id);
	if (!roleNames.some((r) => VIEW_ROLES.includes(r))) {
		redirect("/access-denied");
	}
	const canEdit = roleNames.some((r) => EDIT_ROLES.includes(r));
	const [members, statusOptions] = await Promise.all([
		listMembers(),
		listMemberStatusOptions(),
	]);

	return (
		<SidebarLayout>
			<AdresslistePage
				members={members}
				canEdit={canEdit}
				statusOptions={statusOptions.length > 0 ? statusOptions : undefined}
			/>
		</SidebarLayout>
	);
}

export const metadata = {
	title: "Adressliste",
	description: "Mitglieder-Adressliste",
};
