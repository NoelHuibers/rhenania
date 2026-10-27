// ~/server/actions/userRoles.ts
"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { roles, userRoles } from "~/server/db/schema";
import { ROLES, requireSelfOrRole } from "~/server/lib/authz";

export interface UserRole {
	id: string;
	name: string;
	description: string | null;
}

/**
 * Get all roles for a specific user
 */
export async function getUserRoles(userId: string): Promise<UserRole[]> {
	await requireSelfOrRole(userId, ROLES.admin);
	try {
		const userRoleData = await db
			.select({
				id: roles.id,
				name: roles.name,
				description: roles.description,
			})
			.from(userRoles)
			.innerJoin(roles, eq(userRoles.roleId, roles.id))
			.where(eq(userRoles.userId, userId));

		return userRoleData;
	} catch (error) {
		console.error("Error fetching user roles:", error);
		throw new Error("Failed to fetch user roles");
	}
}

/**
 * Check if a user has a specific role
 */
export async function hasRole(
	userId: string,
	roleName: string,
): Promise<boolean> {
	await requireSelfOrRole(userId, ROLES.admin);
	try {
		const result = await db
			.select({ count: sql`1` })
			.from(userRoles)
			.innerJoin(roles, eq(userRoles.roleId, roles.id))
			.where(and(eq(userRoles.userId, userId), eq(roles.name, roleName)))
			.limit(1);

		return result.length > 0;
	} catch (error) {
		console.error("Error checking user role:", error);
		return false;
	}
}

/**
 * Check if a user has any of the specified roles
 */
export async function hasAnyRole(
	userId: string,
	roleNames: string[],
): Promise<boolean> {
	await requireSelfOrRole(userId, ROLES.admin);
	try {
		const userRoleData = await getUserRoles(userId);
		const userRoleNames = userRoleData.map((role) => role.name);

		return roleNames.some((roleName) => userRoleNames.includes(roleName));
	} catch (error) {
		console.error("Error checking user roles:", error);
		return false;
	}
}
