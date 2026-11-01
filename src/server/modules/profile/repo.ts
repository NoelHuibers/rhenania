// repo.ts — what the profile pages read from the tenant DB (#33).
//
// The member's mirror row and roles, and what another member's public
// profile shows: unlocked achievements and the litres of the last six
// months. Every function takes the database it runs on; none checks the
// caller or applies a rule. A read that may find nothing returns null or
// []; a failed query throws. Names and pictures are written to the global
// identity (lib/user-mirror.ts), not here.

import "server-only";

import { and, eq, gte, isNull, sql } from "drizzle-orm";
import {
	achievements,
	drinks,
	orders,
	roles,
	userAchievements,
	userRoles,
	users,
} from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";

/** The member's mirror row with the e-mail address, or null. */
export async function profileRow(db: TenantDb, userId: string) {
	const [row] = await db
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			image: users.image,
		})
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row ?? null;
}

/** The member's name and picture only, or null if not a member here. */
export async function publicUser(db: TenantDb, userId: string) {
	const [row] = await db
		.select({ id: users.id, name: users.name, image: users.image })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row ?? null;
}

/** The member's roles with their descriptions. */
export async function rolesWithDescriptions(db: TenantDb, userId: string) {
	return db
		.select({
			roleName: roles.name,
			roleDescription: roles.description,
		})
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, userId));
}

/** The member's role names. */
export async function roleNames(db: TenantDb, userId: string) {
	return db
		.select({ roleName: roles.name })
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, userId));
}

/** The member's unlocked achievements that are still active. */
export async function unlockedAchievements(db: TenantDb, userId: string) {
	return db
		.select({
			id: achievements.id,
			name: achievements.name,
			description: achievements.description,
			category: achievements.category,
			icon: achievements.icon,
			points: achievements.points,
			rarity: achievements.rarity,
			unlockedAt: userAchievements.unlockedAt,
		})
		.from(userAchievements)
		.innerJoin(
			achievements,
			eq(userAchievements.achievementId, achievements.id),
		)
		.where(
			and(eq(userAchievements.userId, userId), eq(achievements.isActive, true)),
		);
}

/**
 * Litres of the member's personal orders in the last six months (SQLite's
 * clock), one row.
 */
export async function personalLitresLastSixMonths(
	db: TenantDb,
	userId: string,
) {
	const sixMonthsAgo = sql<number>`unixepoch('now','-6 months')`;
	return db
		.select({
			liters: sql<number>`SUM(CASE WHEN ${drinks.volume} IS NOT NULL THEN ${orders.amount} * ${drinks.volume} ELSE 0 END)`,
		})
		.from(orders)
		.leftJoin(drinks, eq(orders.drinkId, drinks.id))
		.where(
			and(
				eq(orders.userId, userId),
				gte(orders.createdAt, sixMonthsAgo),
				isNull(orders.bookingFor),
			),
		);
}
