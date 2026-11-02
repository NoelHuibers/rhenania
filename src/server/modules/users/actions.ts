"use server";

// actions.ts — the Corps' members and their roles (/admin, #33), and a
// member's own roles. Check the caller and the input, then one call to the
// users service. The changes answer with an ActionResult; the reads keep
// their old answers: a failed read of the Admin page's lists throws
// "Failed to fetch users" / "Failed to fetch roles", a failed read of a
// member's roles "Failed to fetch user roles".

import { z } from "zod";
import { ROLES, requireCaller, requireSelfOrRole } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { scopeOf } from "~/server/lib/tenant-scope";
import * as users from "./service";

const ADMIN_PAGE = ["/admin"];

// ─── The Admin page ──────────────────────────────────────────────────────────

/** Every member with their roles. */
export async function getUsersWithRoles(): Promise<users.UserWithRoles[]> {
	const { tenantId } = await requireCaller(ROLES.admin);
	const tenant = await scopeOf(tenantId);
	try {
		return await users.usersWithRoles(tenant);
	} catch (error) {
		console.error("Failed to fetch users with roles:", error);
		throw new Error("Failed to fetch users");
	}
}

/** Every role with its member count (Admin always first). */
export async function getRolesWithUserCount(): Promise<users.Role[]> {
	const { tenantId } = await requireCaller(ROLES.admin);
	const tenant = await scopeOf(tenantId);
	try {
		return await users.rolesWithUserCount(tenant);
	} catch (error) {
		console.error("Failed to fetch roles:", error);
		throw new Error("Failed to fetch roles");
	}
}

/** Adds the default roles if they don't exist. */
export const initializeRoles = defineAction(
	{
		roles: ROLES.admin,
		errorMessage: "Standardrollen konnten nicht angelegt werden",
	},
	async ({ tenant }) => users.initializeRoles(tenant),
);

/** Toggles a member's role (assign if not present, remove if present). */
export const toggleUserRole = defineAction(
	{
		roles: ROLES.admin,
		schema: z.tuple([z.string(), z.string()]),
		errorMessage: "Rolle konnte nicht geändert werden",
		revalidate: ADMIN_PAGE,
	},
	async ([userId, roleId], { tenant }) =>
		users.toggleRole(tenant, userId, roleId),
);

/**
 * Updates a member's name (the e-mail is theirs to change), on the global
 * identity and in every Corps they belong to.
 */
export const updateUser = defineAction(
	{
		roles: ROLES.admin,
		schema: z.tuple([
			z.string(),
			z.object({ name: z.string().optional(), email: z.string().optional() }),
		]),
		errorMessage: "Benutzer konnte nicht aktualisiert werden",
		revalidate: ADMIN_PAGE,
	},
	async ([userId, data], { tenant }) => users.updateUser(tenant, userId, data),
);

/**
 * Bulk-sets the full member list of a role: adds members not yet assigned,
 * removes the ones no longer selected.
 */
export const bulkSetRoleUsers = defineAction(
	{
		roles: ROLES.admin,
		schema: z.tuple([z.string(), z.array(z.string())]),
		errorMessage: "Rolle konnte nicht gespeichert werden",
		revalidate: ADMIN_PAGE,
	},
	async ([roleId, userIds], { tenant }) =>
		users.setRoleHolders(tenant, roleId, userIds),
);

/**
 * Removes a member from this Corps; the global identity goes with their
 * last membership.
 */
export const deleteUser = defineAction(
	{
		roles: ROLES.admin,
		schema: z.tuple([z.string()]),
		errorMessage: "Benutzer konnte nicht gelöscht werden",
		revalidate: ADMIN_PAGE,
	},
	async ([userId], { tenant }) => users.deleteUser(tenant, userId),
);

// ─── A member's roles ────────────────────────────────────────────────────────

/** The member's roles; the member themselves or an Admin. */
export async function getUserRoles(userId: string): Promise<users.UserRole[]> {
	const { tenantId } = await requireSelfOrRole(userId, ROLES.admin);
	try {
		return await users.rolesOf(await scopeOf(tenantId), userId);
	} catch (error) {
		console.error("Error fetching user roles:", error);
		throw new Error("Failed to fetch user roles");
	}
}

/** Whether the member holds any of `roleNames`. */
export async function hasAnyRole(
	userId: string,
	roleNames: string[],
): Promise<boolean> {
	await requireSelfOrRole(userId, ROLES.admin);
	// A failed read throws rather than answering "no": a database outage is
	// not an access denial (#216).
	const userRoleData = await getUserRoles(userId);
	const userRoleNames = userRoleData.map((role) => role.name);
	return roleNames.some((roleName) => userRoleNames.includes(roleName));
}
