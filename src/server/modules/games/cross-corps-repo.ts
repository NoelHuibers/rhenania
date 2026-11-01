// cross-corps-repo.ts — cross-Corps games in the control DB (#33).
//
// Cross-Corps challenges and games, the memberships and Corps the discovery
// lists, and the unified ELO rows (`control_user_stat`) the rankings read.
// They live in the control DB because they belong to no single Corps; what
// lives in a player's Corps (the ELO preference, achievements) is read
// through that Corps' scope by the service. No function here checks the
// caller or applies a rule.

import "server-only";

import { and, asc, desc, eq, gt, inArray, lt, ne, or } from "drizzle-orm";
import { controlDb } from "~/server/db/control";
import {
	crossTenantChallenges,
	crossTenantGames,
	tenantMemberships,
	tenants,
	userStats,
	users,
} from "~/server/db/control-schema";
import { OPEN_STATUSES } from "./repo";

export type CrossChallenge = typeof crossTenantChallenges.$inferSelect;
type CrossGameInsert = typeof crossTenantGames.$inferInsert;

// ─── Memberships and Corps ───────────────────────────────────────────────────

/** Whether `userId` is an active member of `tenantId`. */
export async function membershipExists(
	userId: string,
	tenantId: string,
): Promise<boolean> {
	const [m] = await controlDb
		.select({ userId: tenantMemberships.userId })
		.from(tenantMemberships)
		.where(
			and(
				eq(tenantMemberships.userId, userId),
				eq(tenantMemberships.tenantId, tenantId),
				eq(tenantMemberships.status, "active"),
			),
		)
		.limit(1);
	return Boolean(m);
}

/** Every active Corps. */
export async function activeTenants() {
	return controlDb
		.select({
			id: tenants.id,
			slug: tenants.slug,
			displayName: tenants.displayName,
		})
		.from(tenants)
		.where(eq(tenants.status, "active"));
}

/** The active memberships of the given Corps (one row per member). */
export async function activeMembershipsOf(tenantIds: string[]) {
	return controlDb
		.select({
			tenantId: tenantMemberships.tenantId,
			userId: tenantMemberships.userId,
		})
		.from(tenantMemberships)
		.where(
			and(
				inArray(tenantMemberships.tenantId, tenantIds),
				eq(tenantMemberships.status, "active"),
			),
		);
}

/** The active members of `tenantId` other than `exceptUserId`. */
export async function memberIdsOf(tenantId: string, exceptUserId: string) {
	const rows = await controlDb
		.select({ userId: tenantMemberships.userId })
		.from(tenantMemberships)
		.where(
			and(
				eq(tenantMemberships.tenantId, tenantId),
				eq(tenantMemberships.status, "active"),
				ne(tenantMemberships.userId, exceptUserId),
			),
		);
	return rows.map((m) => m.userId);
}

/** Names of the given users (the global identity). */
export async function userNames(userIds: string[]) {
	return controlDb
		.select({ id: users.id, name: users.name })
		.from(users)
		.where(inArray(users.id, userIds));
}

/** The name of one user, null if unknown. */
export async function userName(userId: string) {
	const [row] = await controlDb
		.select({ name: users.name })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	return row ?? null;
}

/** Slug and name of the given Corps. */
export async function tenantLabels(tenantIds: string[]) {
	return controlDb
		.select({
			id: tenants.id,
			slug: tenants.slug,
			displayName: tenants.displayName,
		})
		.from(tenants)
		.where(inArray(tenants.id, tenantIds));
}

/** The active Corps the users are active members of, with slug and name. */
export async function activeCorpsOf(userIds: string[]) {
	return controlDb
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
		)
		.orderBy(asc(tenantMemberships.joinedAt), asc(tenantMemberships.tenantId));
}

/**
 * The active Corps the user joined first (their home Corps), null if none.
 * The same pick as the first row per user of `activeCorpsOf`.
 */
export async function firstActiveCorpsOf(userId: string) {
	const [row] = await controlDb
		.select({ slug: tenants.slug, displayName: tenants.displayName })
		.from(tenantMemberships)
		.innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
		.where(
			and(
				eq(tenantMemberships.userId, userId),
				eq(tenantMemberships.status, "active"),
				eq(tenants.status, "active"),
			),
		)
		.orderBy(asc(tenantMemberships.joinedAt), asc(tenantMemberships.tenantId))
		.limit(1);
	return row ?? null;
}

// ─── Unified ELO ─────────────────────────────────────────────────────────────

/** The ELO row of the given users. */
export async function statsOf(userIds: string[]) {
	return controlDb
		.select({
			userId: userStats.userId,
			currentElo: userStats.currentElo,
			totalGames: userStats.totalGames,
		})
		.from(userStats)
		.where(inArray(userStats.userId, userIds));
}

/** The user's ELO row, null if they never played. */
export async function statsRow(userId: string) {
	const [row] = await controlDb
		.select()
		.from(userStats)
		.where(eq(userStats.userId, userId))
		.limit(1);
	return row ?? null;
}

/** ELO rows of players with at least one game, by current ELO. */
export async function rankedStats(limit: number, offset: number) {
	return controlDb
		.select()
		.from(userStats)
		.where(gt(userStats.totalGames, 0))
		.orderBy(desc(userStats.currentElo))
		.limit(limit)
		.offset(offset);
}

/** ELO rows of the given players with at least one game, by current ELO. */
export async function rankedStatsOf(memberIds: string[], limit: number) {
	return controlDb
		.select()
		.from(userStats)
		.where(
			and(inArray(userStats.userId, memberIds), gt(userStats.totalGames, 0)),
		)
		.orderBy(desc(userStats.currentElo))
		.limit(limit);
}

/** The ELO row with the highest peak among players with a game. */
export async function peakStats() {
	const [top] = await controlDb
		.select()
		.from(userStats)
		.where(gt(userStats.totalGames, 0))
		.orderBy(desc(userStats.peakElo))
		.limit(1);
	return top ?? null;
}

// ─── Cross-Corps challenges ──────────────────────────────────────────────────

export async function crossChallengeById(
	challengeId: string,
): Promise<CrossChallenge | null> {
	const [row] = await controlDb
		.select()
		.from(crossTenantChallenges)
		.where(eq(crossTenantChallenges.id, challengeId))
		.limit(1);
	return row ?? null;
}

/** Whether an open challenge between the two players exists, either way. */
export async function hasOpenCrossChallenge(
	playerA: string,
	playerB: string,
): Promise<boolean> {
	const t = crossTenantChallenges;
	const [existing] = await controlDb
		.select({ id: t.id })
		.from(t)
		.where(
			and(
				or(
					and(eq(t.challengerId, playerA), eq(t.opponentId, playerB)),
					and(eq(t.challengerId, playerB), eq(t.opponentId, playerA)),
				),
				inArray(t.status, [...OPEN_STATUSES]),
			),
		)
		.limit(1);
	return Boolean(existing);
}

export async function insertCrossChallenge(
	values: typeof crossTenantChallenges.$inferInsert,
): Promise<string> {
	const [inserted] = await controlDb
		.insert(crossTenantChallenges)
		.values(values)
		.returning({ id: crossTenantChallenges.id });
	if (!inserted) {
		throw new Error("cross-Corps challenge insert returned no row");
	}
	return inserted.id;
}

/** Changes a challenge, whatever its status. */
export async function updateCrossChallenge(
	challengeId: string,
	set: Partial<typeof crossTenantChallenges.$inferInsert>,
): Promise<void> {
	await controlDb
		.update(crossTenantChallenges)
		.set(set)
		.where(eq(crossTenantChallenges.id, challengeId));
}

/**
 * Changes a challenge only while its status is one of `from`; true if it
 * did. Of concurrent callers at most one moves it.
 */
export async function moveCrossChallenge(
	challengeId: string,
	from: readonly CrossChallenge["status"][],
	set: Partial<typeof crossTenantChallenges.$inferInsert>,
): Promise<boolean> {
	const [moved] = await controlDb
		.update(crossTenantChallenges)
		.set(set)
		.where(
			and(
				eq(crossTenantChallenges.id, challengeId),
				from.length === 1
					? eq(
							crossTenantChallenges.status,
							from[0] as CrossChallenge["status"],
						)
					: inArray(crossTenantChallenges.status, [...from]),
			),
		)
		.returning({ id: crossTenantChallenges.id });
	return Boolean(moved);
}

/** Changes a challenge only while it has the status `from` (no read back). */
export async function updateCrossChallengeIf(
	challengeId: string,
	from: CrossChallenge["status"],
	set: Partial<typeof crossTenantChallenges.$inferInsert>,
): Promise<void> {
	await controlDb
		.update(crossTenantChallenges)
		.set(set)
		.where(
			and(
				eq(crossTenantChallenges.id, challengeId),
				eq(crossTenantChallenges.status, from),
			),
		);
}

/**
 * Atomically moves a proposed result into settlement: of concurrent
 * confirms exactly one gets the row back.
 */
export async function claimCrossResult(
	challengeId: string,
): Promise<CrossChallenge | null> {
	const [row] = await controlDb
		.update(crossTenantChallenges)
		.set({ status: "confirmed" })
		.where(
			and(
				eq(crossTenantChallenges.id, challengeId),
				eq(crossTenantChallenges.status, "result_proposed"),
			),
		)
		.returning();
	return row ?? null;
}

/** The cross-Corps game row and the settled status, all or nothing. */
export async function bookCrossSettlement(
	challengeId: string,
	game: CrossGameInsert & { id: string },
): Promise<void> {
	await controlDb.batch([
		controlDb.insert(crossTenantGames).values(game),
		controlDb
			.update(crossTenantChallenges)
			.set({ status: "settled", gameId: game.id })
			.where(
				and(
					eq(crossTenantChallenges.id, challengeId),
					eq(crossTenantChallenges.status, "confirmed"),
				),
			),
	]);
}

/** Expires every challenge whose deadline passed at `now` (three updates). */
export async function expireMissedCrossChallenges(now: Date): Promise<void> {
	const t = crossTenantChallenges;
	// pending + past respondDeadline → expired
	await controlDb
		.update(t)
		.set({ status: "expired" })
		.where(and(eq(t.status, "pending"), lt(t.respondDeadline, now)));
	// accepted + past playDeadline → expired
	await controlDb
		.update(t)
		.set({ status: "expired" })
		.where(and(eq(t.status, "accepted"), lt(t.playDeadline, now)));
	// result_proposed + past confirmDeadline → expired
	await controlDb
		.update(t)
		.set({ status: "expired" })
		.where(and(eq(t.status, "result_proposed"), lt(t.confirmDeadline, now)));
}

/** The user's latest 200 cross-Corps challenges, newest first. */
export async function crossChallengesOf(userId: string) {
	return controlDb
		.select()
		.from(crossTenantChallenges)
		.where(
			or(
				eq(crossTenantChallenges.challengerId, userId),
				eq(crossTenantChallenges.opponentId, userId),
			),
		)
		.orderBy(desc(crossTenantChallenges.createdAt))
		.limit(200);
}
