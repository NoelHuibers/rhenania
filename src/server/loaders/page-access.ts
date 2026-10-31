// page-access.ts — the role gate the protected pages run before loading data.

import "server-only";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { roles, userRoles } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";

/**
 * The signed-in member's role names in the current tenant. Sends signed-out
 * visitors to the sign-in page and members without one of `allowed` to
 * /access-denied.
 */
export async function requirePageRoles(
	allowed: readonly string[],
): Promise<string[]> {
	const session = await auth();
	if (!session?.user?.id) {
		redirect("/auth/signin");
	}

	const db = await getCurrentTenantDb();
	const rows = await db
		.select({ name: roles.name })
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, session.user.id));
	const roleNames = rows.map((r) => r.name);

	if (!roleNames.some((r) => allowed.includes(r))) {
		redirect("/access-denied");
	}
	return roleNames;
}
