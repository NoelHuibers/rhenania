"use server";

// Cross-Corps discovery: list other Corps you can challenge, and their
// members. Both queries run against the control DB.

import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";

import { auth } from "~/server/auth";
import { controlDb } from "~/server/db/control";
import {
	tenantMemberships,
	tenants,
	userStats,
	users,
} from "~/server/db/control-schema";

export type ChallengeableTenant = {
	id: string;
	slug: string;
	displayName: string;
	memberCount: number;
};

export type ChallengeableUser = {
	userId: string;
	name: string | null;
	email: string;
	currentElo: number;
	totalGames: number;
};

export type GlobalLeaderboardEntry = {
	userId: string;
	name: string | null;
	email: string;
	currentElo: number;
	totalGames: number;
	wins: number;
	losses: number;
	winRate: number;
	peakElo: number;
	tenantSlug: string;
	tenantName: string;
};

/**
 * Active tenants the current user can challenge — i.e. every active tenant
 * other than their own.
 */
export async function listChallengeableTenants(): Promise<
	ChallengeableTenant[]
> {
	const session = await auth();
	if (!session?.user?.id) return [];
	const userId = session.user.id;

	// Tenants the user already belongs to (excluded from "other Corps").
	const myMemberships = await controlDb
		.select({ tenantId: tenantMemberships.tenantId })
		.from(tenantMemberships)
		.where(
			and(
				eq(tenantMemberships.userId, userId),
				eq(tenantMemberships.status, "active"),
			),
		);
	const myTenantIds = new Set(myMemberships.map((m) => m.tenantId));

	const allActive = await controlDb
		.select({
			id: tenants.id,
			slug: tenants.slug,
			displayName: tenants.displayName,
		})
		.from(tenants)
		.where(eq(tenants.status, "active"));

	const others = allActive.filter((t) => !myTenantIds.has(t.id));
	if (others.length === 0) return [];

	const counts = await controlDb
		.select({
			tenantId: tenantMemberships.tenantId,
			userId: tenantMemberships.userId,
		})
		.from(tenantMemberships)
		.where(
			and(
				inArray(
					tenantMemberships.tenantId,
					others.map((t) => t.id),
				),
				eq(tenantMemberships.status, "active"),
			),
		);

	const byTenant = new Map<string, number>();
	for (const c of counts) {
		byTenant.set(c.tenantId, (byTenant.get(c.tenantId) ?? 0) + 1);
	}

	return others
		.map((t) => ({ ...t, memberCount: byTenant.get(t.id) ?? 0 }))
		.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Members of the given tenant available for cross-Corps challenge.
 * Excludes the current user (if they happen to also be in that tenant) and
 * sorts by ELO desc as a useful default ordering.
 */
export async function listChallengeableUsers(
	tenantId: string,
): Promise<ChallengeableUser[]> {
	const session = await auth();
	if (!session?.user?.id) return [];
	const myUserId = session.user.id;

	const memberships = await controlDb
		.select({ userId: tenantMemberships.userId })
		.from(tenantMemberships)
		.where(
			and(
				eq(tenantMemberships.tenantId, tenantId),
				eq(tenantMemberships.status, "active"),
				ne(tenantMemberships.userId, myUserId),
			),
		);
	if (memberships.length === 0) return [];
	const memberIds = memberships.map((m) => m.userId);

	const [userRows, statsRows] = await Promise.all([
		controlDb
			.select({ id: users.id, name: users.name, email: users.email })
			.from(users)
			.where(inArray(users.id, memberIds)),
		controlDb
			.select({
				userId: userStats.userId,
				currentElo: userStats.currentElo,
				totalGames: userStats.totalGames,
			})
			.from(userStats)
			.where(inArray(userStats.userId, memberIds)),
	]);

	const statsById = new Map(statsRows.map((s) => [s.userId, s]));
	return userRows
		.map((u) => ({
			userId: u.id,
			name: u.name,
			email: u.email,
			currentElo: statsById.get(u.id)?.currentElo ?? 1200,
			totalGames: statsById.get(u.id)?.totalGames ?? 0,
		}))
		.sort((a, b) => b.currentElo - a.currentElo);
}

/**
 * Global / external leaderboard — ranks every user across every Corps by
 * unified ELO. Each row is annotated with the user's first listed Corps
 * (display label).
 */
export async function getGlobalLeaderboard(
	limit: number = 50,
	offset: number = 0,
): Promise<GlobalLeaderboardEntry[]> {
	const stats = await controlDb
		.select()
		.from(userStats)
		.where(gt(userStats.totalGames, 0))
		.orderBy(desc(userStats.currentElo))
		.limit(limit)
		.offset(offset);

	if (stats.length === 0) return [];

	const userIds = stats.map((s) => s.userId);

	const [userRows, membershipRows] = await Promise.all([
		controlDb
			.select({ id: users.id, name: users.name, email: users.email })
			.from(users)
			.where(inArray(users.id, userIds)),
		controlDb
			.select({
				userId: tenantMemberships.userId,
				tenantId: tenantMemberships.tenantId,
				slug: tenants.slug,
				displayName: tenants.displayName,
			})
			.from(tenantMemberships)
			.innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
			.where(
				and(
					inArray(tenantMemberships.userId, userIds),
					eq(tenantMemberships.status, "active"),
					eq(tenants.status, "active"),
				),
			),
	]);

	const userById = new Map(userRows.map((u) => [u.id, u]));
	// Pick the first membership we see for each user as their display Corps.
	// Real fix: a "primary tenant" preference; v1 punt.
	const tenantByUser = new Map<string, { slug: string; displayName: string }>();
	for (const m of membershipRows) {
		if (!tenantByUser.has(m.userId)) {
			tenantByUser.set(m.userId, {
				slug: m.slug,
				displayName: m.displayName,
			});
		}
	}

	return stats.map((s) => {
		const u = userById.get(s.userId);
		const t = tenantByUser.get(s.userId);
		return {
			userId: s.userId,
			name: u?.name ?? null,
			email: u?.email ?? "",
			currentElo: s.currentElo,
			totalGames: s.totalGames,
			wins: s.wins,
			losses: s.losses,
			winRate: s.totalGames > 0 ? (s.wins / s.totalGames) * 100 : 0,
			peakElo: s.peakElo || s.currentElo,
			tenantSlug: t?.slug ?? "",
			tenantName: t?.displayName ?? "",
		};
	});
}
