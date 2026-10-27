// actions/admin.ts
"use server";

import { and, eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { controlDb } from "~/server/db/control";
import {
	accounts,
	users as controlUsers,
	sessions,
	tenantMemberships,
	userStats,
} from "~/server/db/control-schema";
import {
	billPDFs,
	bills,
	challenges,
	games,
	homepageImages,
	inventories,
	members,
	orders,
	roles,
	userRoles,
	users,
} from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";
import { ROLES, requireRole } from "~/server/lib/authz";
import { forgetMembership, requireTenantId } from "~/server/lib/tenant-context";
import { seedDefaultRoles } from "~/server/lib/tenant-seed";
import { mirrorUserToAllMemberTenants } from "~/server/lib/user-mirror";

// Types for our data
export type UserWithRoles = {
	id: string;
	name: string | null;
	email: string | null;
	emailVerified: boolean | null;
	image: string | null;
	roles: Array<{
		id: string;
		name: string;
		description: string | null;
	}>;
};

export type Role = {
	id: string;
	name: string;
	description: string | null;
	userCount: number;
};

/**
 * Get all users with their assigned roles
 */
export async function getUsersWithRoles(): Promise<UserWithRoles[]> {
	await requireRole(ROLES.admin);
	const db = await getCurrentTenantDb();
	try {
		const usersWithRoles = await db
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				emailVerified: users.emailVerified,
				image: users.image,
				roleId: roles.id,
				roleName: roles.name,
				roleDescription: roles.description,
			})
			.from(users)
			.leftJoin(userRoles, eq(users.id, userRoles.userId))
			.leftJoin(roles, eq(userRoles.roleId, roles.id));

		// Group users and their roles
		const userMap = new Map<string, UserWithRoles>();

		for (const row of usersWithRoles) {
			if (!userMap.has(row.id)) {
				userMap.set(row.id, {
					id: row.id,
					name: row.name,
					email: row.email,
					emailVerified: row.emailVerified,
					image: row.image,
					roles: [],
				});
			}

			// biome-ignore lint/style/noNonNullAssertion: guarded by userMap.has check above
			const user = userMap.get(row.id)!;
			if (row.roleId && row.roleName) {
				user.roles.push({
					id: row.roleId,
					name: row.roleName,
					description: row.roleDescription,
				});
			}
		}

		return Array.from(userMap.values());
	} catch (error) {
		console.error("Failed to fetch users with roles:", error);
		throw new Error("Failed to fetch users");
	}
}

/**
 * Get all roles with user count (Admin always first)
 */
export async function getRolesWithUserCount(): Promise<Role[]> {
	await requireRole(ROLES.admin);
	const db = await getCurrentTenantDb();
	try {
		const rolesWithCount = await db
			.select({
				id: roles.id,
				name: roles.name,
				description: roles.description,
				userCount: sql<number>`count(${userRoles.userId})`,
			})
			.from(roles)
			.leftJoin(userRoles, eq(roles.id, userRoles.roleId))
			.groupBy(roles.id, roles.name, roles.description);

		// Sort to ensure Admin is always first
		return rolesWithCount.sort((a, b) => {
			if (a.name === "Admin") {
				return -1;
			}
			if (b.name === "Admin") {
				return 1;
			}
			return a.name.localeCompare(b.name);
		});
	} catch (error) {
		console.error("Failed to fetch roles:", error);
		throw new Error("Failed to fetch roles");
	}
}

/**
 * Initialize default roles if they don't exist
 */
export async function initializeRoles(): Promise<void> {
	await requireRole(ROLES.admin);
	const db = await getCurrentTenantDb();
	try {
		// One statement for the shared default list (also used when a tenant
		// is provisioned); roles that already exist keep their description.
		await seedDefaultRoles(db);
	} catch (error) {
		console.error("Failed to initialize roles:", error);
		throw new Error("Failed to initialize roles");
	}
}

/**
 * Assign a role to a user
 */
export async function assignUserRole(
	userId: string,
	roleId: string,
): Promise<void> {
	await requireRole(ROLES.admin);
	const db = await getCurrentTenantDb();
	try {
		// Check if assignment already exists
		const existingAssignment = await db
			.select()
			.from(userRoles)
			.where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
			.limit(1);

		if (existingAssignment.length === 0) {
			await db.insert(userRoles).values({
				userId,
				roleId,
				assignedAt: sql`(unixepoch())`,
			});
		}

		revalidatePath("/admin");
	} catch (error) {
		console.error("Failed to assign role:", error);
		throw new Error("Failed to assign role");
	}
}

/**
 * Remove a role from a user
 */
export async function removeUserRole(
	userId: string,
	roleId: string,
): Promise<void> {
	await requireRole(ROLES.admin);
	const db = await getCurrentTenantDb();
	try {
		await db
			.delete(userRoles)
			.where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));

		revalidatePath("/admin");
	} catch (error) {
		console.error("Failed to remove role:", error);
		throw new Error("Failed to remove role");
	}
}

/**
 * Toggle a user's role (assign if not present, remove if present)
 */
export async function toggleUserRole(
	userId: string,
	roleId: string,
): Promise<void> {
	await requireRole(ROLES.admin);
	const db = await getCurrentTenantDb();
	try {
		const existingAssignment = await db
			.select()
			.from(userRoles)
			.where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
			.limit(1);

		if (existingAssignment.length > 0) {
			await removeUserRole(userId, roleId);
		} else {
			await assignUserRole(userId, roleId);
		}
	} catch (error) {
		console.error("Failed to toggle role:", error);
		throw new Error("Failed to toggle role");
	}
}

/**
 * Update a user's name and/or email. Writes the control-DB source of truth,
 * then mirrors to all tenant DBs the user belongs to.
 */
/**
 * Tenant admins may only act on users of their own tenant. Identity is
 * global, so without this an admin of one Corps could edit or delete
 * accounts that belong to another Corps.
 */
async function assertMemberOfCurrentTenant(userId: string): Promise<string> {
	const tenantId = await requireTenantId();
	const [membership] = await controlDb
		.select({ userId: tenantMemberships.userId })
		.from(tenantMemberships)
		.where(
			and(
				eq(tenantMemberships.userId, userId),
				eq(tenantMemberships.tenantId, tenantId),
			),
		)
		.limit(1);
	if (!membership) {
		throw new Error("Diese Person ist kein Mitglied dieses Corps.");
	}
	return tenantId;
}

export async function updateUser(
	userId: string,
	data: { name?: string; email?: string },
): Promise<void> {
	await requireRole(ROLES.admin);
	await assertMemberOfCurrentTenant(userId);

	const [current] = await controlDb
		.select({ email: controlUsers.email })
		.from(controlUsers)
		.where(eq(controlUsers.id, userId))
		.limit(1);
	if (!current) {
		throw new Error("Benutzer nicht gefunden");
	}
	// The email is the login identity across every Corps; a tenant admin
	// must not be able to redirect it (password reset would follow).
	if (
		data.email !== undefined &&
		data.email.trim().toLowerCase() !== current.email.toLowerCase()
	) {
		throw new Error(
			"Die E-Mail-Adresse kann nur von der Person selbst geändert werden.",
		);
	}
	const name = data.name?.trim();
	if (name === undefined) {
		return;
	}
	if (name.length === 0 || name.length > 255) {
		throw new Error("Ungültiger Name");
	}

	try {
		await controlDb
			.update(controlUsers)
			.set({ name, updatedAt: new Date() })
			.where(eq(controlUsers.id, userId));

		const [refreshed] = await controlDb
			.select()
			.from(controlUsers)
			.where(eq(controlUsers.id, userId))
			.limit(1);
		if (refreshed) {
			await mirrorUserToAllMemberTenants({
				id: refreshed.id,
				name: refreshed.name,
				email: refreshed.email,
				emailVerified: refreshed.emailVerified,
				image: refreshed.image,
				createdAt: refreshed.createdAt,
				updatedAt: refreshed.updatedAt,
			});
		}

		revalidatePath("/admin");
	} catch (error) {
		console.error("Failed to update user:", error);
		throw new Error("Failed to update user");
	}
}

/**
 * Bulk-set the full user list for a role.
 * Adds users not yet assigned, removes users no longer selected.
 */
export async function bulkSetRoleUsers(
	roleId: string,
	userIds: string[],
): Promise<void> {
	await requireRole(ROLES.admin);
	const db = await getCurrentTenantDb();
	try {
		const current = await db
			.select({ userId: userRoles.userId })
			.from(userRoles)
			.where(eq(userRoles.roleId, roleId));

		const currentIds = new Set(current.map((r) => r.userId));
		const nextIds = new Set(userIds);

		const toAdd = userIds.filter((id) => !currentIds.has(id));
		const toRemove = [...currentIds].filter((id) => !nextIds.has(id));

		if (toAdd.length > 0) {
			await db.insert(userRoles).values(
				toAdd.map((userId) => ({
					userId,
					roleId,
					assignedAt: sql`(unixepoch())`,
				})),
			);
		}

		for (const userId of toRemove) {
			await db
				.delete(userRoles)
				.where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
		}

		revalidatePath("/admin");
	} catch (error) {
		console.error("Failed to bulk set role users:", error);
		throw new Error("Failed to bulk set role users");
	}
}

/**
 * Remove a user from the CURRENT tenant: delete their tenant-local data,
 * mirror row, and membership. The global identity (control DB user, accounts,
 * sessions, cross-Corps stats) is only deleted when this was their last
 * remaining tenant membership — identity is shared across tenants, so one
 * tenant's admin must not destroy it while other memberships exist.
 */
export async function deleteUser(userId: string): Promise<void> {
	await requireRole(ROLES.admin);
	const tenantId = await assertMemberOfCurrentTenant(userId);
	const db = await getCurrentTenantDb();
	try {
		// Nullify nullable FK columns that reference this user
		await db
			.update(homepageImages)
			.set({ uploadedBy: null })
			.where(eq(homepageImages.uploadedBy, userId));

		await db
			.update(inventories)
			.set({ performedBy: null })
			.where(eq(inventories.performedBy, userId));

		// Unlink the Adressliste member row (the entry itself stays)
		await db
			.update(members)
			.set({ userId: null })
			.where(eq(members.userId, userId));

		// Delete bill PDFs (no cascade from bills → billPDFs)
		await db.delete(billPDFs).where(eq(billPDFs.userId, userId));

		// Delete bills (billItems cascade from bills)
		await db.delete(bills).where(eq(bills.userId, userId));

		// Delete orders
		await db.delete(orders).where(eq(orders.userId, userId));

		// Delete challenges the user is involved in (no cascade, FK would block)
		await db
			.delete(challenges)
			.where(
				or(
					eq(challenges.challengerId, userId),
					eq(challenges.opponentId, userId),
					eq(challenges.proposedWinnerId, userId),
					eq(challenges.proposedById, userId),
				),
			);

		// Delete games the user participated in
		await db
			.delete(games)
			.where(
				or(
					eq(games.player1Id, userId),
					eq(games.player2Id, userId),
					eq(games.winnerId, userId),
				),
			);

		// Delete the tenant `users` mirror — cascades: userRoles,
		// userPreferences, userAchievements, achievementProgress,
		// userPaymentInfo; members.userId is set null by its FK.
		await db.delete(users).where(eq(users.id, userId));

		// Control DB: remove the membership for THIS tenant only.
		await controlDb
			.delete(tenantMemberships)
			.where(
				and(
					eq(tenantMemberships.userId, userId),
					eq(tenantMemberships.tenantId, tenantId),
				),
			);
		forgetMembership(userId, tenantId);

		// Last membership gone → delete the global identity as before.
		const [remaining] = await controlDb
			.select({ tenantId: tenantMemberships.tenantId })
			.from(tenantMemberships)
			.where(eq(tenantMemberships.userId, userId))
			.limit(1);
		if (!remaining) {
			await controlDb.delete(sessions).where(eq(sessions.userId, userId));
			await controlDb.delete(accounts).where(eq(accounts.userId, userId));
			// Cross-Corps stats only go when the identity does.
			await controlDb.delete(userStats).where(eq(userStats.userId, userId));
			await controlDb.delete(controlUsers).where(eq(controlUsers.id, userId));
		}

		revalidatePath("/admin");
	} catch (error) {
		console.error("Failed to delete user:", error);
		throw new Error("Failed to delete user");
	}
}
