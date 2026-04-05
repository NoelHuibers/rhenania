import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { KontenPage } from "~/components/konten/KontenPage";
import { getKontos } from "~/server/actions/kontos/kontos";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { roles, userRoles } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

async function getUserRoleNames(userId: string): Promise<string[]> {
	const rows = await db
		.select({ name: roles.name })
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, userId));
	return rows.map((r) => r.name);
}

const ALLOWED_ROLES = ["Admin", "Getränkewart", "CCKasse", "Aktivenkasse"];

export default async function KontenRoute() {
	const session = await auth();
	if (!session?.user?.id) redirect("/auth/signin");

	const roleNames = await getUserRoleNames(session.user.id);
	const hasAccess = roleNames.some((r) => ALLOWED_ROLES.includes(r));
	if (!hasAccess) redirect("/access-denied");

	const result = await getKontos();
	const initialKontos = result.success ? result.kontos : [];
	const isAdmin = roleNames.includes("Admin");

	return (
		<SidebarLayout>
			<KontenPage initialKontos={initialKontos} isAdmin={isAdmin} />
		</SidebarLayout>
	);
}

export const metadata = {
	title: "Konten - Rhenania",
	description: "Corps-Konten verwalten",
};
