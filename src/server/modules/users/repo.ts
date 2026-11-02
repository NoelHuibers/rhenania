// repo.ts — members and their roles in the tenant DB (#33).
//
// Drizzle reads and writes of the user mirror, roles and role
// assignments, and removing a member's data from this Corps. Every
// function takes the database it runs on; none checks the caller or
// applies a rule. A failed query throws.

import "server-only";

import { and, eq, or, sql } from "drizzle-orm";
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
import type { TenantDb } from "~/server/db/tenants";

/** Every member with each of their roles (one row per role, or none). */
export async function usersWithRoleRows(db: TenantDb) {
	return db
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
}

/** Every role with how many members hold it. */
export async function rolesWithUserCount(db: TenantDb) {
	return db
		.select({
			id: roles.id,
			name: roles.name,
			description: roles.description,
			userCount: sql<number>`count(${userRoles.userId})`,
		})
		.from(roles)
		.leftJoin(userRoles, eq(roles.id, userRoles.roleId))
		.groupBy(roles.id, roles.name, roles.description);
}

/** The member's roles. */
export async function rolesOf(db: TenantDb, userId: string) {
	return db
		.select({
			id: roles.id,
			name: roles.name,
			description: roles.description,
		})
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, userId));
}

/** Whether the member holds the role. */
export async function hasRole(
	db: TenantDb,
	userId: string,
	roleId: string,
): Promise<boolean> {
	const existing = await db
		.select()
		.from(userRoles)
		.where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
		.limit(1);
	return existing.length > 0;
}

/** The ids of the members holding the role. */
export async function holdersOf(
	db: TenantDb,
	roleId: string,
): Promise<string[]> {
	const rows = await db
		.select({ userId: userRoles.userId })
		.from(userRoles)
		.where(eq(userRoles.roleId, roleId));
	return rows.map((r) => r.userId);
}

/** Gives the role to each of the members. */
export async function assignRole(
	db: TenantDb,
	roleId: string,
	userIds: string[],
) {
	await db.insert(userRoles).values(
		userIds.map((userId) => ({
			userId,
			roleId,
			assignedAt: sql`(unixepoch())`,
		})),
	);
}

export async function unassignRole(
	db: TenantDb,
	userId: string,
	roleId: string,
) {
	await db
		.delete(userRoles)
		.where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
}

/**
 * Removes the member's data from this Corps: their pictures, inventories
 * and Adressliste entry stay (unlinked), their bills, orders, challenges
 * and games go, then the mirror row with what cascades from it (roles,
 * preferences, achievements, payment info).
 */
export async function deleteMemberData(db: TenantDb, userId: string) {
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
}
