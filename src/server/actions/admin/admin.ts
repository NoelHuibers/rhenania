// actions/admin.ts
"use server";

import { and, eq, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db/index";
import {
	accounts,
	billPDFs,
	bills,
	games,
	homepageImages,
	inventories,
	orders,
	roles,
	sessions,
	userRoles,
	userStats,
	users,
} from "~/server/db/schema";

// Types for our data
export type UserWithRoles = {
	id: string;
	name: string | null;
	email: string | null;
	emailVerified: Date | null;
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
			if (a.name === "Admin") return -1;
			if (b.name === "Admin") return 1;
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
	try {
		const defaultRoles = [
			{ name: "Admin", description: "Systemadministration" },
			{ name: "Versorger", description: "Getränkeversorgung" },
			{
				name: "Fuchs",
				description: "Fuchsenladen Management",
			},
			{ name: "Fotowart", description: "Fotos der Website verwalten" },
			{ name: "Faxe", description: "Faxe, Hausmeister, Putzfirma" },
			{ name: "Hausbewohner", description: "Aktive" },
		];

		for (const role of defaultRoles) {
			// Check if role exists
			const existingRole = await db
				.select()
				.from(roles)
				.where(eq(roles.name, role.name))
				.limit(1);

			if (existingRole.length === 0) {
				await db.insert(roles).values(role);
			}
		}
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
 * Delete a user and all their associated data
 */
export async function deleteUser(userId: string): Promise<void> {
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

		// Delete bill PDFs (no cascade from bills → billPDFs)
		await db.delete(billPDFs).where(eq(billPDFs.userId, userId));

		// Delete bills (billItems cascade from bills)
		await db.delete(bills).where(eq(bills.userId, userId));

		// Delete orders
		await db.delete(orders).where(eq(orders.userId, userId));

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

		// Delete user stats
		await db.delete(userStats).where(eq(userStats.userId, userId));

		// Delete auth data
		await db.delete(sessions).where(eq(sessions.userId, userId));
		await db.delete(accounts).where(eq(accounts.userId, userId));

		// Delete the user — cascades: userRoles, userPreferences, userAchievements, achievementProgress
		await db.delete(users).where(eq(users.id, userId));

		revalidatePath("/admin");
	} catch (error) {
		console.error("Failed to delete user:", error);
		throw new Error("Failed to delete user");
	}
}
