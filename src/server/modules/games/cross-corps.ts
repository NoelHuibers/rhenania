// cross-corps.ts — games between players of two Corps (#33): challenges
// from creation to settlement, and the discovery and rankings across Corps.
//
// The challenge and the game live in the control DB (./cross-corps-repo).
// What lives in a player's Corps is read through that Corps' own scope,
// never through the request's: the challenger's is the caller's
// (`challenger`, from the guard), the opponent's is opened explicitly with
// `scopeOf(opponentTenantId)`, and settling opens one scope per player's
// Corps for the achievements. The ELO is the same unified `userStats` as
// in intra-Corps games: one ELO per user.

import "server-only";

import { after } from "next/server";
import {
	CONFIRM_WINDOW_MS,
	type CrossChallengeFeed,
	type CrossChallengeView,
	type CrossPaymentRule,
	crossChallengeFeed,
	emptyFeed,
	gameElo,
	PLAY_WINDOW_MS,
	RESPOND_WINDOW_MS,
} from "~/server/domain/games/challenges";
import type { Member } from "~/server/lib/authz";
import { ActionError } from "~/server/lib/define-action";
import {
	ConflictError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";
import { readEloEnabled } from "~/server/lib/elo-preference";
import { scopeOf, type TenantScope } from "~/server/lib/tenant-scope";
import {
	applyEloOutcome,
	type EloOutcome,
	revertEloOutcome,
} from "~/server/lib/user-stats";
import {
	type AchievementEvent,
	checkAndUnlockAchievements,
} from "~/server/modules/achievements/tracking";
import * as repo from "./cross-corps-repo";

type Actor = Pick<Member, "id">;

const NOT_FOUND = "Herausforderung nicht gefunden";
const NOT_A_PLAYER = "Keine Berechtigung";

/** The challenge row; throws NotFoundError if there is none. */
async function crossChallenge(challengeId: string) {
	const row = await repo.crossChallengeById(challengeId);
	if (!row) {
		throw new NotFoundError(NOT_FOUND);
	}
	return row;
}

const isPlayer = (row: repo.CrossChallenge, user: Actor) =>
	row.challengerId === user.id || row.opponentId === user.id;

/**
 * The opponent's ELO switch, read from their own Corps' DB through its
 * explicit scope.
 */
async function isEloEnabledInCorps(
	userId: string,
	tenantId: string,
): Promise<boolean> {
	try {
		const opponentCorps = await scopeOf(tenantId);
		return await readEloEnabled(opponentCorps.db, userId);
	} catch {
		// Corps DB unavailable (e.g. suspended): no ranked games with it.
		return false;
	}
}

// ─── Create ──────────────────────────────────────────────────────────────────

export type CreateCrossChallengeInput = {
	opponentId: string;
	opponentTenantId: string;
	payment?: CrossPaymentRule;
	drinkName?: string | null;
	quantity?: number;
};

/**
 * Challenges a member of another Corps. The challenger plays for the Corps
 * of `challenger`, the scope they are signed in to.
 */
export async function createCrossChallenge(
	challenger: TenantScope,
	user: Actor,
	input: CreateCrossChallengeInput,
): Promise<{ challengeId: string }> {
	const challengerId = user.id;

	if (challengerId === input.opponentId) {
		throw new ValidationError("Du kannst dich nicht selbst herausfordern");
	}

	if (challenger.tenantId === input.opponentTenantId) {
		throw new ValidationError(
			"Mitspieler aus deinem Corps werden über die normale Herausforderung gefordert",
		);
	}

	// Opponent must actually be a member of the chosen tenant.
	if (
		!(await repo.membershipExists(input.opponentId, input.opponentTenantId))
	) {
		throw new ActionError(
			"Spieler ist kein aktives Mitglied dieses Corps",
			"NOT_A_MEMBER",
		);
	}

	// Both players must have ELO enabled. The preference is per Corps, so
	// each player's is read from their own Corps' DB.
	const [challengerEnabled, opponentEnabled] = await Promise.all([
		readEloEnabled(challenger.db, challengerId),
		isEloEnabledInCorps(input.opponentId, input.opponentTenantId),
	]);
	if (!challengerEnabled) {
		throw new ActionError(
			"Aktiviere Eloranking in deinen Einstellungen",
			"ELO_DISABLED",
		);
	}
	if (!opponentEnabled) {
		throw new ActionError(
			"Dieser Spieler nimmt nicht am Eloranking teil",
			"ELO_DISABLED",
		);
	}

	const now = challenger.now();
	await repo.expireMissedCrossChallenges(now);

	// Block if there's already an open cross-tenant challenge between these two.
	if (await repo.hasOpenCrossChallenge(challengerId, input.opponentId)) {
		throw new ConflictError(
			"Es gibt bereits eine offene Herausforderung zwischen euch",
		);
	}

	const challengeId = await repo.insertCrossChallenge({
		challengerId,
		challengerTenantId: challenger.tenantId,
		opponentId: input.opponentId,
		opponentTenantId: input.opponentTenantId,
		status: "pending",
		payment: input.payment ?? "none",
		drinkName: input.drinkName ?? null,
		quantity: Math.max(1, Math.min(input.quantity ?? 2, 100)),
		respondDeadline: new Date(now.getTime() + RESPOND_WINDOW_MS),
	});
	return { challengeId };
}

// ─── Respond ─────────────────────────────────────────────────────────────────

export async function respondToCrossChallenge(
	tenant: TenantScope,
	user: Actor,
	challengeId: string,
	response: "accept" | "decline",
): Promise<void> {
	const row = await crossChallenge(challengeId);
	if (row.opponentId !== user.id) {
		throw new ActionError(
			"Nur der Herausgeforderte kann antworten",
			"FORBIDDEN",
		);
	}
	if (row.status !== "pending") {
		throw new ConflictError(
			"Diese Herausforderung kann nicht mehr beantwortet werden",
		);
	}
	if (row.respondDeadline.getTime() < tenant.now().getTime()) {
		await repo.updateCrossChallenge(row.id, { status: "expired" });
		throw new ConflictError("Herausforderung ist abgelaufen", "EXPIRED");
	}

	if (response === "accept") {
		const now = tenant.now();
		await repo.updateCrossChallenge(row.id, {
			status: "accepted",
			acceptedAt: now,
			playDeadline: new Date(now.getTime() + PLAY_WINDOW_MS),
		});
	} else {
		await repo.updateCrossChallenge(row.id, {
			status: "declined",
			declinedAt: tenant.now(),
		});
	}
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

const NOT_CANCELLABLE =
	"Diese Herausforderung kann nicht mehr abgebrochen werden";

export async function cancelCrossChallenge(
	user: Actor,
	challengeId: string,
): Promise<void> {
	const row = await crossChallenge(challengeId);
	if (!isPlayer(row, user)) {
		throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
	}
	if (row.status !== "pending" && row.status !== "accepted") {
		throw new ConflictError(NOT_CANCELLABLE);
	}

	const cancelled = await repo.moveCrossChallenge(
		challengeId,
		["pending", "accepted"],
		{ status: "cancelled" },
	);
	if (!cancelled) {
		throw new ConflictError(NOT_CANCELLABLE);
	}
}

// ─── Propose result ──────────────────────────────────────────────────────────

export async function proposeCrossResult(
	tenant: TenantScope,
	user: Actor,
	challengeId: string,
	winnerId: string,
): Promise<void> {
	const row = await crossChallenge(challengeId);
	if (!isPlayer(row, user)) {
		throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
	}
	if (row.status !== "accepted") {
		throw new ConflictError("Spielt erst, dann das Ergebnis melden");
	}
	if (winnerId !== row.challengerId && winnerId !== row.opponentId) {
		throw new ValidationError("Ungültiger Gewinner");
	}

	// Only from "accepted": a cancel or the sweep may have closed it
	// meanwhile.
	const now = tenant.now();
	const proposed = await repo.moveCrossChallenge(row.id, ["accepted"], {
		status: "result_proposed",
		proposedWinnerId: winnerId,
		proposedById: user.id,
		proposedAt: now,
		confirmDeadline: new Date(now.getTime() + CONFIRM_WINDOW_MS),
	});
	if (!proposed) {
		throw new ConflictError(
			"Ergebnis kann nur in laufenden Spielen gemeldet werden",
		);
	}
}

// ─── Confirm result ──────────────────────────────────────────────────────────

const NO_PROPOSAL = "Es liegt kein Ergebnisvorschlag vor";

/** Confirms the opponent's proposed result and settles the challenge. */
export async function confirmCrossResult(
	tenant: TenantScope,
	user: Actor,
	challengeId: string,
): Promise<{ gameId: string }> {
	const row = await crossChallenge(challengeId);
	if (row.status !== "result_proposed") {
		throw new ConflictError(NO_PROPOSAL);
	}
	if (row.proposedById === user.id) {
		throw new ActionError(
			"Der Gegner muss bestätigen, nicht der Vorschlagende",
			"FORBIDDEN",
		);
	}
	if (!isPlayer(row, user)) {
		throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
	}
	if (
		row.confirmDeadline &&
		row.confirmDeadline.getTime() < tenant.now().getTime()
	) {
		await repo.updateCrossChallengeIf(row.id, "result_proposed", {
			status: "expired",
		});
		throw new ConflictError("Bestätigungsfrist abgelaufen", "EXPIRED");
	}

	return await settleCrossChallenge(challengeId);
}

// ─── Dispute result ──────────────────────────────────────────────────────────

const NO_OPEN_PROPOSAL = "Kein Ergebnisvorschlag offen";

export async function disputeCrossResult(
	user: Actor,
	challengeId: string,
): Promise<void> {
	const row = await crossChallenge(challengeId);
	if (row.status !== "result_proposed") {
		throw new ConflictError(NO_OPEN_PROPOSAL);
	}
	if (row.proposedById === user.id) {
		throw new ActionError("Du hast den Vorschlag selbst gemacht", "FORBIDDEN");
	}
	if (!isPlayer(row, user)) {
		throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
	}

	// Only while still proposed: a confirm may claim it meanwhile.
	const disputed = await repo.moveCrossChallenge(
		challengeId,
		["result_proposed"],
		{ status: "disputed" },
	);
	if (!disputed) {
		throw new ConflictError(NO_OPEN_PROPOSAL);
	}
}

// ─── Settle ──────────────────────────────────────────────────────────────────

/**
 * Books a proposed result: cross-Corps game row and unified ELO. Throws a
 * ConflictError when there is nothing (left) to settle.
 */
async function settleCrossChallenge(
	challengeId: string,
): Promise<{ gameId: string }> {
	// Claim the row atomically: of concurrent confirms exactly one continues.
	const row = await repo.claimCrossResult(challengeId);
	if (!row) {
		throw new ConflictError(NO_PROPOSAL);
	}
	const release = () =>
		repo.updateCrossChallengeIf(row.id, "confirmed", {
			status: "result_proposed",
		});
	if (row.proposedWinnerId == null) {
		await release();
		throw new ConflictError("Kein Gewinner vorgeschlagen");
	}

	const winnerId = row.proposedWinnerId;
	const loserId =
		winnerId === row.challengerId ? row.opponentId : row.challengerId;

	// Apply ELO outcome — same unified userStats as intra-Corps games.
	let elo: EloOutcome;
	try {
		elo = await applyEloOutcome(winnerId, loserId);
	} catch (error) {
		await release();
		throw error;
	}

	const gameId = crypto.randomUUID();
	try {
		await repo.bookCrossSettlement(row.id, {
			id: gameId,
			player1Id: row.challengerId,
			player1TenantId: row.challengerTenantId,
			player2Id: row.opponentId,
			player2TenantId: row.opponentTenantId,
			winnerId,
			...gameElo(row.challengerId === winnerId, elo),
			challengeId: row.id,
		});
	} catch (error) {
		// Take the ELO back first; if that fails too, the claim stays so
		// nobody applies it a second time.
		await revertEloOutcome(winnerId, loserId, elo);
		await release();
		throw error;
	}

	after(() => trackCrossGame(row, winnerId, loserId));

	return { gameId };
}

/**
 * Each player's achievements live in the Corps they played for: two
 * explicit scopes, the challenger's and the opponent's. A Corps whose DB is
 * unavailable is logged and skipped; tracking never fails the game.
 */
function trackCrossGame(
	row: repo.CrossChallenge,
	winnerId: string,
	loserId: string,
) {
	const challengerCorps = scopeOf(row.challengerTenantId);
	const opponentCorps = scopeOf(row.opponentTenantId);
	const track = async (userId: string, event: AchievementEvent) => {
		try {
			const corps = await (userId === row.challengerId
				? challengerCorps
				: opponentCorps);
			await checkAndUnlockAchievements(corps, userId, event);
		} catch (error) {
			console.error("Achievement tracking error:", error);
		}
	};
	return Promise.all([
		track(row.challengerId, "game_played"),
		track(row.opponentId, "game_played"),
		track(winnerId, "game_won"),
		track(loserId, "game_lost"),
	]);
}

// ─── Feed ────────────────────────────────────────────────────────────────────

/**
 * The user's cross-Corps challenges, whichever Corps they played for,
 * sorted for the feed; expires due ones first.
 */
export async function crossChallengesOf(
	tenant: TenantScope,
	userId: string,
): Promise<CrossChallengeFeed> {
	await repo.expireMissedCrossChallenges(tenant.now());

	const rows = await repo.crossChallengesOf(userId);
	if (rows.length === 0) {
		return emptyFeed();
	}

	// Resolve display names (control users + tenant slug/name).
	const userIds = new Set<string>();
	const tenantIds = new Set<string>();
	for (const r of rows) {
		userIds.add(r.challengerId);
		userIds.add(r.opponentId);
		tenantIds.add(r.challengerTenantId);
		tenantIds.add(r.opponentTenantId);
	}
	const [userRows, tenantRows] = await Promise.all([
		repo.userNames([...userIds]),
		repo.tenantLabels([...tenantIds]),
	]);
	const userById = new Map(userRows.map((u) => [u.id, u]));
	const tenantById = new Map(tenantRows.map((t) => [t.id, t]));

	const views: CrossChallengeView[] = rows.map((r) => {
		const challengerTenant = tenantById.get(r.challengerTenantId);
		const opponentTenant = tenantById.get(r.opponentTenantId);
		return {
			id: r.id,
			status: r.status,
			payment: r.payment,
			quantity: r.quantity,
			drinkName: r.drinkName,
			challengerId: r.challengerId,
			challengerName: userById.get(r.challengerId)?.name ?? null,
			challengerTenantSlug: challengerTenant?.slug ?? "",
			challengerTenantName: challengerTenant?.displayName ?? "",
			opponentId: r.opponentId,
			opponentName: userById.get(r.opponentId)?.name ?? null,
			opponentTenantSlug: opponentTenant?.slug ?? "",
			opponentTenantName: opponentTenant?.displayName ?? "",
			proposedWinnerId: r.proposedWinnerId,
			proposedById: r.proposedById,
			createdAt: r.createdAt,
			acceptedAt: r.acceptedAt,
			respondDeadline: r.respondDeadline,
			playDeadline: r.playDeadline,
			confirmDeadline: r.confirmDeadline,
			gameId: r.gameId,
			role: r.challengerId === userId ? "challenger" : "opponent",
		};
	});
	return crossChallengeFeed(views, userId);
}

// ─── Discovery and rankings ──────────────────────────────────────────────────

export type ChallengeableTenant = {
	id: string;
	slug: string;
	displayName: string;
	memberCount: number;
};

export type ChallengeableUser = {
	userId: string;
	name: string | null;
	currentElo: number;
	totalGames: number;
};

export type GlobalLeaderboardEntry = {
	userId: string;
	name: string | null;
	currentElo: number;
	totalGames: number;
	wins: number;
	losses: number;
	winRate: number;
	peakElo: number;
	tenantSlug: string;
	tenantName: string;
};

export type GlobalPeakHolder = {
	name: string | null;
	peakElo: number;
	tenantSlug: string;
	tenantName: string;
};

/**
 * Active Corps the caller can challenge: every active Corps other than
 * `tenant`, the one they are signed in to. Members of several Corps can
 * still pick any of their other Corps.
 */
export async function challengeableTenants(
	tenant: TenantScope,
): Promise<ChallengeableTenant[]> {
	const allActive = await repo.activeTenants();
	const others = allActive.filter((t) => t.id !== tenant.tenantId);
	if (others.length === 0) {
		return [];
	}

	const memberships = await repo.activeMembershipsOf(others.map((t) => t.id));
	const byTenant = new Map<string, number>();
	for (const m of memberships) {
		byTenant.set(m.tenantId, (byTenant.get(m.tenantId) ?? 0) + 1);
	}

	return others
		.map((t) => ({ ...t, memberCount: byTenant.get(t.id) ?? 0 }))
		.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Members of `tenantId` the user can challenge (not the user themselves,
 * if they are a member there too), by ELO. Only for a Corps
 * `challengeableTenants` offers: another active one (#244).
 */
export async function challengeableUsers(
	tenant: TenantScope,
	tenantId: string,
	userId: string,
): Promise<ChallengeableUser[]> {
	if (tenantId === tenant.tenantId) {
		return [];
	}
	const active = await repo.activeTenants();
	if (!active.some((t) => t.id === tenantId)) {
		return [];
	}
	const memberIds = await repo.memberIdsOf(tenantId, userId);
	if (memberIds.length === 0) {
		return [];
	}

	const [userRows, statsRows] = await Promise.all([
		repo.userNames(memberIds),
		repo.statsOf(memberIds),
	]);

	const statsById = new Map(statsRows.map((s) => [s.userId, s]));
	return userRows
		.map((u) => ({
			userId: u.id,
			name: u.name,
			currentElo: statsById.get(u.id)?.currentElo ?? 1200,
			totalGames: statsById.get(u.id)?.totalGames ?? 0,
		}))
		.sort((a, b) => b.currentElo - a.currentElo);
}

/**
 * Player who has held the highest peak ELO across all Corps. One indexed
 * lookup + two small joins.
 */
export async function globalPeakEloHolder(): Promise<GlobalPeakHolder | null> {
	const top = await repo.peakStats();
	if (!top) {
		return null;
	}
	const userRow = await repo.userName(top.userId);
	const tenantRow = await repo.firstActiveCorpsOf(top.userId);
	return {
		name: userRow?.name ?? null,
		peakElo: top.peakElo || top.currentElo,
		tenantSlug: tenantRow?.slug ?? "",
		tenantName: tenantRow?.displayName ?? "",
	};
}

/**
 * Global leaderboard: every player of every Corps by unified ELO, each
 * labelled with the active Corps they joined first.
 */
export async function globalLeaderboard(
	limit: number,
	offset: number,
): Promise<GlobalLeaderboardEntry[]> {
	const stats = await repo.rankedStats(limit, offset);
	if (stats.length === 0) {
		return [];
	}

	const userIds = stats.map((s) => s.userId);
	const [userRows, membershipRows] = await Promise.all([
		repo.userNames(userIds),
		repo.activeCorpsOf(userIds),
	]);

	const userById = new Map(userRows.map((u) => [u.id, u]));
	// Each player is labelled with the Corps they joined first (#244):
	// memberships come ordered by join date.
	const tenantByUser = new Map<string, { slug: string; displayName: string }>();
	for (const m of membershipRows) {
		if (!tenantByUser.has(m.userId)) {
			tenantByUser.set(m.userId, { slug: m.slug, displayName: m.displayName });
		}
	}

	return stats.map((s) => {
		const u = userById.get(s.userId);
		const t = tenantByUser.get(s.userId);
		return {
			userId: s.userId,
			name: u?.name ?? null,
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
