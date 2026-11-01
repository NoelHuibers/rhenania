"use server";

// actions.ts — every game action (#33): intra- and cross-Corps challenges,
// the Eloranking's reads and the member lists. Check the caller and the
// input, then one call to the games service. The changes answer with an
// ActionResult; the reads keep their old answers: the feeds and the
// challenge lists are empty for a signed-out caller, the Eloranking's
// reads log a failed query and answer it with [].

import { z } from "zod";
import {
	type ChallengeFeed,
	type CrossChallengeFeed,
	emptyFeed,
} from "~/server/domain/games/challenges";
import { AuthzError, requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { scopeOf } from "~/server/lib/tenant-scope";
import * as crossCorps from "./cross-corps";
import * as games from "./service";

export type {
	ChallengeFeed,
	ChallengeView,
	CrossChallengeFeed,
	CrossChallengeView,
	PaymentRule,
} from "~/server/domain/games/challenges";
export type {
	ChallengeableTenant,
	ChallengeableUser,
} from "./cross-corps";
export type { GameRecord, User } from "./service";

/**
 * The caller and their scope, or null if they are no member here: these
 * reads answer a signed-out caller with nothing.
 */
async function requireRoles() {
	try {
		const { member, tenantId } = await requireCaller();
		return { member, tenant: await scopeOf(tenantId) };
	} catch (error) {
		if (error instanceof AuthzError) {
			return null;
		}
		throw error;
	}
}

// ─── Intra-Corps challenges ──────────────────────────────────────────────────

/** Pages that show challenges; revalidated after every change. */
const CHALLENGE_PATHS = ["/eloranking", "/challenges"];

export const createChallenge = defineAction(
	{
		schema: z.tuple([
			z.object({
				opponentId: z.string(),
				drinkId: z.string(),
				payment: z.enum(["challenger", "loser", "split"]),
			}),
		]),
		revalidate: CHALLENGE_PATHS,
		errorMessage: "Herausforderung fehlgeschlagen",
	},
	async ([input], { tenant, user }) =>
		games.createChallenge(tenant, user, input),
);

export const respondToChallenge = defineAction(
	{
		schema: z.tuple([
			z.object({
				challengeId: z.string(),
				response: z.enum(["accept", "decline"]),
			}),
		]),
		revalidate: CHALLENGE_PATHS,
	},
	async ([input], { tenant, user }) =>
		games.respondToChallenge(tenant, user, input.challengeId, input.response),
);

export const cancelChallenge = defineAction(
	{ schema: z.tuple([z.string()]), revalidate: CHALLENGE_PATHS },
	async ([challengeId], { tenant, user }) =>
		games.cancelChallenge(tenant, user, challengeId),
);

export const proposeResult = defineAction(
	{
		schema: z.tuple([
			z.object({ challengeId: z.string(), winnerId: z.string() }),
		]),
		revalidate: CHALLENGE_PATHS,
	},
	async ([input], { tenant, user }) =>
		games.proposeResult(tenant, user, input.challengeId, input.winnerId),
);

export const confirmResult = defineAction(
	{
		schema: z.tuple([z.string()]),
		errorMessage:
			"Das Ergebnis konnte nicht gebucht werden. Bitte versuche es erneut.",
	},
	// Revalidates the pages itself: the sweep settles too.
	async ([challengeId], { tenant, user }) =>
		games.confirmResult(tenant, user, challengeId),
);

export const disputeResult = defineAction(
	{ schema: z.tuple([z.string()]), revalidate: CHALLENGE_PATHS },
	async ([challengeId], { tenant, user }) =>
		games.disputeResult(tenant, user, challengeId),
);

/** The caller's challenge feed (polled by the badge); empty if signed out. */
export async function getMyChallenges(): Promise<ChallengeFeed> {
	const caller = await requireRoles();
	if (!caller) {
		return emptyFeed();
	}
	return games.challengesOf(caller.tenant, caller.member.id);
}

// ─── Cross-Corps challenges ──────────────────────────────────────────────────

/** Pages that show cross-Corps challenges; revalidated after every change. */
const CROSS_CHALLENGE_PATHS = ["/eloranking"];

export const createCrossTenantChallenge = defineAction(
	{
		schema: z.tuple([
			z.object({
				opponentId: z.string(),
				opponentTenantId: z.string(),
				payment: z.enum(["none", "challenger", "loser", "split"]).optional(),
				drinkName: z.string().nullish(),
				quantity: z.number().optional(),
			}),
		]),
		revalidate: CROSS_CHALLENGE_PATHS,
		errorMessage: "Fehler beim Erstellen",
	},
	// The challenger plays for the Corps they are signed in to.
	async ([input], { tenant, user }) =>
		crossCorps.createCrossChallenge(tenant, user, input),
);

export const respondToCrossTenantChallenge = defineAction(
	{
		schema: z.tuple([
			z.object({
				challengeId: z.string(),
				response: z.enum(["accept", "decline"]),
			}),
		]),
		revalidate: CROSS_CHALLENGE_PATHS,
	},
	async ([input], { tenant, user }) =>
		crossCorps.respondToCrossChallenge(
			tenant,
			user,
			input.challengeId,
			input.response,
		),
);

export const cancelCrossTenantChallenge = defineAction(
	{ schema: z.tuple([z.string()]), revalidate: CROSS_CHALLENGE_PATHS },
	async ([challengeId], { user }) =>
		crossCorps.cancelCrossChallenge(user, challengeId),
);

export const proposeCrossTenantResult = defineAction(
	{
		schema: z.tuple([
			z.object({ challengeId: z.string(), winnerId: z.string() }),
		]),
		revalidate: CROSS_CHALLENGE_PATHS,
	},
	async ([input], { tenant, user }) =>
		crossCorps.proposeCrossResult(
			tenant,
			user,
			input.challengeId,
			input.winnerId,
		),
);

export const confirmCrossTenantResult = defineAction(
	{
		schema: z.tuple([z.string()]),
		revalidate: CROSS_CHALLENGE_PATHS,
		errorMessage:
			"Das Ergebnis konnte nicht gebucht werden. Bitte versuche es erneut.",
	},
	async ([challengeId], { tenant, user }) =>
		crossCorps.confirmCrossResult(tenant, user, challengeId),
);

export const disputeCrossTenantResult = defineAction(
	{ schema: z.tuple([z.string()]), revalidate: CROSS_CHALLENGE_PATHS },
	async ([challengeId], { user }) =>
		crossCorps.disputeCrossResult(user, challengeId),
);

/** The caller's cross-Corps challenge feed; empty if signed out. */
export async function getMyCrossTenantChallenges(): Promise<CrossChallengeFeed> {
	const caller = await requireRoles();
	if (!caller) {
		return emptyFeed();
	}
	return crossCorps.crossChallengesOf(caller.tenant, caller.member.id);
}

/** The other active Corps the caller can challenge; [] if signed out. */
export async function listChallengeableTenants(): Promise<
	crossCorps.ChallengeableTenant[]
> {
	const caller = await requireRoles();
	return caller ? crossCorps.challengeableTenants(caller.tenant) : [];
}

/** Members of `tenantId` the caller can challenge; [] if signed out. */
export async function listChallengeableUsers(
	tenantId: string,
): Promise<crossCorps.ChallengeableUser[]> {
	const caller = await requireRoles();
	return caller
		? crossCorps.challengeableUsers(caller.tenant, tenantId, caller.member.id)
		: [];
}

// ─── Rankings ────────────────────────────────────────────────────────────────

/** The player with the highest peak ELO across all Corps. */
export async function getGlobalPeakEloHolder(): Promise<crossCorps.GlobalPeakHolder | null> {
	await requireCaller();
	return crossCorps.globalPeakEloHolder();
}

/** Every player of every Corps by unified ELO. */
export async function getGlobalLeaderboard(
	limit: number = 50,
	offset: number = 0,
): Promise<crossCorps.GlobalLeaderboardEntry[]> {
	await requireCaller();
	return crossCorps.globalLeaderboard(limit, offset);
}

/** The Corps' latest games with ELO; [] if the read fails. */
export async function getRecentGames(
	limit: number = 10,
): Promise<games.GameRecord[]> {
	const { tenantId } = await requireCaller();
	try {
		return await games.recentGames(await scopeOf(tenantId), limit);
	} catch (error) {
		console.error("Error getting recent games:", error);
		return [];
	}
}

/** The Corps' leaderboard (top players by ELO); [] if the read fails. */
export async function getLeaderboard(
	limit: number = 10,
	offset: number = 0,
): Promise<games.UserGameStats[]> {
	const { tenantId } = await requireCaller();
	try {
		return await games.leaderboard(await scopeOf(tenantId), limit, offset);
	} catch (error) {
		console.error("Error getting leaderboard:", error);
		return [];
	}
}

// ─── Member lists ────────────────────────────────────────────────────────────

/** Every member of the Corps (the Getränkewart's booking list). */
export async function getAllUsers(): Promise<games.User[]> {
	const caller = await requireRoles();
	if (!caller) {
		throw new Error("Unauthorized");
	}
	return games.members(caller.tenant);
}

/** The members the caller can challenge. */
export async function getAllUsersExcept(): Promise<games.User[]> {
	const caller = await requireRoles();
	if (!caller) {
		throw new Error("Unauthorized");
	}
	try {
		return await games.challengeableMembers(caller.tenant, caller.member.id);
	} catch (error) {
		console.error("Error fetching users:", error);
		throw new Error("Failed to fetch users");
	}
}
