// service.ts — games within one Corps (#33): challenges from creation to
// settlement, the Eloranking's reads and the profile's ELO card.
//
// Every function takes the TenantScope of the Corps it plays in and reads
// its clock; failures the user should read are DomainErrors, anything else
// (a failed query) propagates. The ELO itself is unified across Corps and
// lives in the control DB (`lib/user-stats`). Cross-Corps games are in
// ./cross-corps.

import "server-only";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { UserStats as KpiStats } from "~/components/profile/KPIGrid";
import { orderTotal, unitPriceFor } from "~/lib/pricing";
import { dayKeyInTZ } from "~/lib/time";
import {
	type ChallengeFeed,
	type ChallengeStatus,
	type ChallengeView,
	CONFIRM_WINDOW_MS,
	challengeFeed,
	DECLINE_COOLDOWN_MS,
	emptyFeed,
	gameElo,
	type PaymentRule,
	PLAY_WINDOW_MS,
	plannedOrders,
	RESPOND_WINDOW_MS,
} from "~/server/domain/games/challenges";
import type { Member } from "~/server/lib/authz";
import { ActionError } from "~/server/lib/define-action";
import {
	ConflictError,
	DomainError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";
import { isEloOptOut, readEloEnabled } from "~/server/lib/elo-preference";
import { log } from "~/server/lib/log";
import type { TenantScope } from "~/server/lib/tenant-scope";
import {
	applyEloOutcome,
	type EloOutcome,
	revertEloOutcome,
} from "~/server/lib/user-stats";
import { checkAndUnlockAchievements } from "~/server/modules/achievements/tracking";
import { drinkPricing } from "~/server/modules/getraenkekasse/service";
import * as crossCorps from "./cross-corps-repo";
import * as repo from "./repo";

type Actor = Pick<Member, "id">;

const NOT_FOUND = "Herausforderung nicht gefunden";
const NOT_A_PLAYER = "Keine Berechtigung";

const isPlayer = (
	row: { challengerId: string; opponentId: string },
	user: Actor,
) => row.challengerId === user.id || row.opponentId === user.id;

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createChallenge(
	tenant: TenantScope,
	user: Actor,
	input: { opponentId: string; drinkId: string; payment: PaymentRule },
): Promise<{ challengeId: string }> {
	const { db } = tenant;
	const challengerId = user.id;

	if (challengerId === input.opponentId) {
		throw new ValidationError("Du kannst dich nicht selbst herausfordern");
	}

	// Both players must have ELO enabled
	const [challengerEnabled, opponentEnabled] = await Promise.all([
		readEloEnabled(db, challengerId),
		readEloEnabled(db, input.opponentId),
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

	// Drink must exist and be available
	const drink = await repo.drinkAvailability(db, input.drinkId);
	if (!drink) {
		throw new NotFoundError("Getränk nicht gefunden");
	}
	if (!drink.isCurrentlyAvailable) {
		throw new ConflictError("Getränk ist nicht verfügbar");
	}

	// Lazy sweep expired challenges so stale rows don't block
	await sweepExpiredChallenges(tenant);

	// At most one open challenge in the same direction
	if (await repo.hasOpenChallenge(db, challengerId, input.opponentId)) {
		throw new ConflictError(
			"Du hast bereits eine offene Herausforderung an diesen Spieler",
		);
	}

	// Cooldown after decline (same direction)
	const now = tenant.now().getTime();
	const cooldownCutoff = new Date(now - DECLINE_COOLDOWN_MS);
	if (
		await repo.declinedSince(db, challengerId, input.opponentId, cooldownCutoff)
	) {
		throw new ConflictError(
			"Bitte warte eine Stunde bevor du erneut herausforderst",
			"COOLDOWN",
		);
	}

	const challengeId = await repo.insertChallenge(db, {
		challengerId,
		opponentId: input.opponentId,
		drinkId: input.drinkId,
		payment: input.payment,
		quantity: 2,
		status: "pending",
		respondDeadline: new Date(now + RESPOND_WINDOW_MS),
	});
	return { challengeId };
}

// ─── Respond ─────────────────────────────────────────────────────────────────

export async function respondToChallenge(
	tenant: TenantScope,
	user: Actor,
	challengeId: string,
	response: "accept" | "decline",
): Promise<void> {
	const { db } = tenant;
	const row = await repo.challengeById(db, challengeId);
	if (!row) {
		throw new NotFoundError(NOT_FOUND);
	}
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
	const now = tenant.now();
	if (row.respondDeadline.getTime() < now.getTime()) {
		await repo.updateChallenge(db, row.id, { status: "expired" });
		throw new ConflictError("Herausforderung ist abgelaufen", "EXPIRED");
	}

	if (response === "accept") {
		await repo.updateChallenge(db, row.id, {
			status: "accepted",
			acceptedAt: now,
			playDeadline: new Date(now.getTime() + PLAY_WINDOW_MS),
		});
	} else {
		await repo.updateChallenge(db, row.id, {
			status: "declined",
			declinedAt: now,
		});
	}
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

const RESULT_PROPOSED_ERROR =
	"Ein Ergebnis wurde gemeldet: bestätigen oder anfechten";
const NOT_CANCELLABLE = "Kann nicht mehr abgebrochen werden";

export async function cancelChallenge(
	tenant: TenantScope,
	user: Actor,
	challengeId: string,
): Promise<void> {
	const { db } = tenant;
	const row = await repo.challengePlayers(db, challengeId);
	if (!row) {
		throw new NotFoundError(NOT_FOUND);
	}
	if (!isPlayer(row, user)) {
		throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
	}
	if (row.status === "result_proposed") {
		throw new ConflictError(RESULT_PROPOSED_ERROR);
	}
	if (
		!repo.CANCELLABLE_STATUSES.includes(
			row.status as (typeof repo.CANCELLABLE_STATUSES)[number],
		)
	) {
		throw new ConflictError(NOT_CANCELLABLE);
	}

	// Only from the status checked above: a proposal or the sweep may move
	// it on meanwhile.
	const cancelled = await repo.moveChallenge(
		db,
		challengeId,
		repo.CANCELLABLE_STATUSES,
		{ status: "cancelled" },
	);
	if (!cancelled) {
		throw new ConflictError(NOT_CANCELLABLE);
	}
}

// ─── Propose result ──────────────────────────────────────────────────────────

const NOT_RUNNING = "Ergebnis kann nur in laufenden Spielen gemeldet werden";

export async function proposeResult(
	tenant: TenantScope,
	user: Actor,
	challengeId: string,
	winnerId: string,
): Promise<void> {
	const { db } = tenant;
	const row = await repo.challengeById(db, challengeId);
	if (!row) {
		throw new NotFoundError(NOT_FOUND);
	}
	if (!isPlayer(row, user)) {
		throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
	}
	if (row.status !== "accepted") {
		throw new ConflictError(NOT_RUNNING);
	}
	if (winnerId !== row.challengerId && winnerId !== row.opponentId) {
		throw new ValidationError("Ungültiger Gewinner");
	}

	// Only from "accepted": a cancel or the sweep may have closed it
	// meanwhile.
	const now = tenant.now();
	const proposed = await repo.moveChallenge(db, row.id, ["accepted"], {
		status: "result_proposed",
		proposedWinnerId: winnerId,
		proposedById: user.id,
		proposedAt: now,
		confirmDeadline: new Date(now.getTime() + CONFIRM_WINDOW_MS),
	});
	if (!proposed) {
		throw new ConflictError(NOT_RUNNING);
	}
}

// ─── Confirm result ──────────────────────────────────────────────────────────

const NOTHING_TO_CONFIRM = "Kein Ergebnis zum Bestätigen";

/** Confirms the opponent's proposed result and settles the challenge. */
export async function confirmResult(
	tenant: TenantScope,
	user: Actor,
	challengeId: string,
): Promise<{ gameId: string }> {
	const row = await repo.challengeById(tenant.db, challengeId);
	if (!row) {
		throw new NotFoundError(NOT_FOUND);
	}
	if (row.status !== "result_proposed") {
		throw new ConflictError(NOTHING_TO_CONFIRM);
	}
	// Only the non-proposer can confirm
	if (row.proposedById === user.id) {
		throw new ActionError(
			"Der Gegenspieler muss das Ergebnis bestätigen",
			"FORBIDDEN",
		);
	}
	if (!isPlayer(row, user)) {
		throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
	}

	// Revalidates the pages itself: the sweep settles too.
	return await settleChallenge(tenant, row.id);
}

// ─── Dispute result ──────────────────────────────────────────────────────────

const NOTHING_TO_DISPUTE = "Nichts anzufechten";

export async function disputeResult(
	tenant: TenantScope,
	user: Actor,
	challengeId: string,
): Promise<void> {
	const { db } = tenant;
	const row = await repo.challengePlayers(db, challengeId);
	if (!row) {
		throw new NotFoundError(NOT_FOUND);
	}
	if (row.status !== "result_proposed") {
		throw new ConflictError(NOTHING_TO_DISPUTE);
	}
	if (row.proposedById === user.id) {
		throw new ActionError(
			"Du kannst dein eigenes Ergebnis nicht anfechten",
			"FORBIDDEN",
		);
	}
	if (!isPlayer(row, user)) {
		throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
	}

	const disputed = await repo.moveChallenge(
		db,
		challengeId,
		["result_proposed"],
		{ status: "disputed" },
	);
	if (!disputed) {
		throw new ConflictError(NOTHING_TO_DISPUTE);
	}
}

// ─── Settle ──────────────────────────────────────────────────────────────────

/** Reads what settling needs; throws a DomainError if something is missing. */
async function planSettlement(tenant: TenantScope, row: repo.Challenge) {
	if (row.proposedWinnerId == null) {
		throw new ConflictError("Kein Gewinner vorgeschlagen");
	}
	const winnerId = row.proposedWinnerId;
	const loserId =
		winnerId === row.challengerId ? row.opponentId : row.challengerId;

	const [{ drink, winner, loser }, pricing] = await Promise.all([
		repo.settlementRows(tenant.db, row.drinkId, winnerId, loserId),
		drinkPricing(tenant),
	]);
	if (!drink) {
		throw new NotFoundError("Getränk nicht gefunden");
	}
	if (!winner || !loser) {
		throw new NotFoundError("Spieler nicht gefunden");
	}

	// Challenge drinks are personal orders, so they carry the tenant's markup
	// when that feature is on.
	const pricePerUnit = unitPriceFor(drink.price, pricing.markupPercent, null);
	const orderRows = plannedOrders(row, winner, loser)
		.filter((o) => o.amount > 0)
		.map((o) => ({
			userId: o.userId,
			userName: o.userName,
			drinkId: drink.id,
			drinkName: drink.name,
			amount: o.amount,
			pricePerUnit,
			costPerUnit: pricing.enabled ? drink.price : null,
			total: orderTotal(pricePerUnit, o.amount, pricing.markupPercent),
			bookingFor: null,
		}));

	const challengerIsWinner = row.challengerId === winnerId;
	return { winnerId, loserId, challengerIsWinner, orderRows } as const;
}

/**
 * Books a proposed result: game row, unified ELO, the drinks. Throws a
 * DomainError when there is nothing (left) to settle.
 */
async function settleChallenge(
	tenant: TenantScope,
	challengeId: string,
): Promise<{ gameId: string }> {
	const { db } = tenant;
	const row = await repo.claimProposedResult(db, challengeId);
	if (!row) {
		throw new ConflictError(NOTHING_TO_CONFIRM);
	}

	// Until the ELO is applied, giving the claim back undoes everything.
	let plan: Awaited<ReturnType<typeof planSettlement>>;
	let elo: EloOutcome;
	try {
		plan = await planSettlement(tenant, row);
		// Unified userStats (control DB), atomic for both players.
		elo = await applyEloOutcome(plan.winnerId, plan.loserId);
	} catch (error) {
		await repo.releaseClaim(db, row.id);
		throw error;
	}

	const { winnerId, loserId, challengerIsWinner, orderRows } = plan;
	const gameId = crypto.randomUUID();
	try {
		// Orders, game and final status land together or not at all.
		await repo.bookSettlement(
			db,
			row.id,
			{
				id: gameId,
				player1Id: row.challengerId,
				player2Id: row.opponentId,
				winnerId,
				...gameElo(challengerIsWinner, elo),
				challengeId: row.id,
			},
			orderRows,
		);
	} catch (error) {
		// Take the ELO back first; if that fails too, the claim stays so
		// nobody applies it a second time.
		await revertEloOutcome(winnerId, loserId, elo);
		await repo.releaseClaim(db, row.id);
		throw error;
	}

	// Achievements run after the response, against this Corps explicitly.
	after(() =>
		Promise.all([
			checkAndUnlockAchievements(tenant, row.challengerId, "game_played"),
			checkAndUnlockAchievements(tenant, row.opponentId, "game_played"),
			checkAndUnlockAchievements(tenant, winnerId, "game_won"),
			checkAndUnlockAchievements(tenant, loserId, "game_lost"),
		]),
	);

	revalidatePath("/eloranking");
	revalidatePath("/challenges");
	revalidatePath("/rechnung");

	return { gameId };
}

// ─── Sweeper ─────────────────────────────────────────────────────────────────

/**
 * Expires unanswered and unplayed challenges and auto-settles results nobody
 * confirmed in time. Every open page polls the challenge feed, so the sweep
 * first looks (one indexed read) and only writes when something is due: an
 * UPDATE that matches nothing still takes the write lock on the primary.
 */
async function sweepExpiredChallenges(tenant: TenantScope): Promise<void> {
	const { db } = tenant;
	const now = tenant.now();

	const due = await repo.dueChallenges(db, now);
	if (due.length === 0) {
		return;
	}

	// pending past respondDeadline / accepted past playDeadline → expired.
	if (due.some((c) => c.status !== "result_proposed")) {
		await repo.expireMissedChallenges(db, now);
	}

	// result_proposed past confirmDeadline → auto-settle. Each settlement
	// claims its row first, so concurrent sweeps (every open page polls this)
	// book every challenge exactly once.
	for (const { id, status } of due) {
		if (status !== "result_proposed") {
			continue;
		}
		try {
			await settleChallenge(tenant, id);
		} catch (error) {
			// Settled by a concurrent sweep, or not settleable: nothing to log.
			if (error instanceof DomainError) {
				continue;
			}
			await log.error("challenge auto-settle failed", {
				challengeId: id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

// ─── Feed ────────────────────────────────────────────────────────────────────

/** The user's challenges, sorted for the feed; sweeps due ones first. */
export async function challengesOf(
	tenant: TenantScope,
	userId: string,
): Promise<ChallengeFeed> {
	await sweepExpiredChallenges(tenant);

	// Challenge, drink and both players in one query.
	const rows = await repo.challengeFeedRows(tenant.db, userId);
	if (rows.length === 0) {
		return emptyFeed();
	}

	const views: ChallengeView[] = rows.map((r) => ({
		id: r.id,
		status: r.status as ChallengeStatus,
		payment: r.payment as PaymentRule,
		quantity: r.quantity,
		drinkId: r.drinkId,
		drinkName: r.drinkName ?? "Unbekannt",
		drinkPrice: r.drinkPrice ?? 0,
		challengerId: r.challengerId,
		challengerName: r.challengerName ?? null,
		challengerAvatar: r.challengerAvatar ?? null,
		opponentId: r.opponentId,
		opponentName: r.opponentName ?? null,
		opponentAvatar: r.opponentAvatar ?? null,
		proposedWinnerId: r.proposedWinnerId,
		proposedById: r.proposedById,
		createdAt: r.createdAt,
		acceptedAt: r.acceptedAt,
		respondDeadline: r.respondDeadline,
		playDeadline: r.playDeadline,
		confirmDeadline: r.confirmDeadline,
		gameId: r.gameId,
		role: r.challengerId === userId ? "challenger" : "opponent",
	}));
	return challengeFeed(views, userId);
}

// ─── The Eloranking ──────────────────────────────────────────────────────────

export interface GameRecord {
	id: string;
	player1Id: string;
	player2Id: string;
	player1Avatar: string | null;
	player2Avatar: string | null;
	winnerId: string;
	playedAt: Date;
	gameType: string | null;
	player1Name: string | null;
	player2Name: string | null;
	winnerName: string | null;
	player1EloBefore: number;
	player2EloBefore: number;
	player1EloAfter: number;
	player2EloAfter: number;
	eloChange: number;
}

export interface UserGameStats {
	userId: string;
	userName: string | null;
	userEmail: string | null;
	avatar?: string | null;
	currentElo: number;
	totalGames: number;
	wins: number;
	losses: number;
	winRate: number;
	peakElo?: number;
}

// Rating used when a game row has no ELO values.
const DEFAULT_ELO = 1200;

/**
 * The Corps' latest games between players who both take part in the
 * ranking, with names, pictures and the winner's ELO change.
 */
export async function recentGames(
	tenant: TenantScope,
	limit: number,
): Promise<GameRecord[]> {
	const { db } = tenant;
	const latest = await repo.recentGames(db, limit);

	// Every player's name, picture and opt-out in one read (#244).
	const ids = new Set(latest.flatMap((g) => [g.player1Id, g.player2Id]));
	for (const g of latest) {
		if (g.winnerId) {
			ids.add(g.winnerId);
		}
	}
	const cards = new Map(
		(await repo.playerCards(db, [...ids])).map((c) => [c.userId, c]),
	);
	const takesPart = (userId: string) =>
		!isEloOptOut(cards.get(userId)?.prefValue);

	return latest
		.filter((g) => takesPart(g.player1Id) && takesPart(g.player2Id))
		.map((game) => {
			const player1 = cards.get(game.player1Id);
			const player2 = cards.get(game.player2Id);
			// Calculate ELO change for display
			const player1Won = game.winnerId === game.player1Id;
			const eloChange = Math.abs(
				player1Won
					? (game.player1EloAfter ?? 0) - (game.player1EloBefore ?? 0)
					: (game.player2EloAfter ?? 0) - (game.player2EloBefore ?? 0),
			);
			return {
				...game,
				player1Name: player1?.userName || null,
				player2Name: player2?.userName || null,
				player1Avatar: player1?.avatar || null,
				player2Avatar: player2?.avatar || null,
				winnerName:
					(game.winnerId && cards.get(game.winnerId)?.userName) || null,
				player1EloBefore: game.player1EloBefore ?? DEFAULT_ELO,
				player2EloBefore: game.player2EloBefore ?? DEFAULT_ELO,
				player1EloAfter: game.player1EloAfter ?? DEFAULT_ELO,
				player2EloAfter: game.player2EloAfter ?? DEFAULT_ELO,
				eloChange,
			};
		});
}

/**
 * Internal leaderboard: members of the Corps who take part in the ranking,
 * by their unified ELO. Two steps, because the members and their
 * preference live in the Corps' DB and the ELO in the control DB.
 */
export async function leaderboard(
	tenant: TenantScope,
	limit: number,
	offset: number,
): Promise<UserGameStats[]> {
	// 1. Tenant-side: members + their ELO opt-out preference.
	const members = await repo.rankedMembers(tenant.db);
	const memberIds = members.map((m) => m.userId);
	if (memberIds.length === 0) {
		return [];
	}

	// 2. Control-side: stats for those members, ordered by ELO.
	const stats = await crossCorps.rankedStatsOf(memberIds, limit + offset);

	const memberById = new Map(members.map((m) => [m.userId, m]));
	return stats.slice(offset, offset + limit).map((s) => {
		const m = memberById.get(s.userId);
		return {
			userId: s.userId,
			userName: m?.userName ?? null,
			userEmail: m?.userEmail ?? null,
			avatar: m?.avatar ?? null,
			currentElo: s.currentElo,
			totalGames: s.totalGames,
			wins: s.wins,
			losses: s.losses,
			winRate: s.totalGames > 0 ? (s.wins / s.totalGames) * 100 : 0,
			peakElo: s.peakElo || s.currentElo,
		};
	});
}

export type { User } from "./repo";

/** Every member of the Corps (the Getränkewart's booking list). */
export function members(tenant: TenantScope): Promise<repo.User[]> {
	return repo.allUsers(tenant.db);
}

/** Who the user can challenge: the other members in the ranking. */
export function challengeableMembers(
	tenant: TenantScope,
	userId: string,
): Promise<repo.User[]> {
	return repo.challengeableMembers(tenant.db, userId);
}

// ─── The profile's ELO card ──────────────────────────────────────────────────

export type EloHistoryPoint = { date: string; elo: number };

const eloAfter = (
	game: {
		player1Id: string;
		player1EloAfter: number | null;
		player2EloAfter: number | null;
	},
	userId: string,
) =>
	game.player1Id === userId
		? (game.player1EloAfter ?? 1200)
		: (game.player2EloAfter ?? 1200);

/**
 * Unified ELO stats for a user: the control DB's `control_user_stat` row,
 * or a fallback computed from this Corps' games, plus the ELO history of
 * the last 50 games in this Corps.
 */
export async function eloStatsOf(
	tenant: TenantScope,
	userId: string,
): Promise<{ stats: KpiStats; eloHistory: EloHistoryPoint[] }> {
	const { db } = tenant;
	let stats: KpiStats | undefined =
		(await crossCorps.statsRow(userId)) ?? undefined;

	if (!stats) {
		const gameStats = await repo.gameTotals(db, userId);
		const latestGame = await repo.latestGameElo(db, userId);
		const currentElo = latestGame ? eloAfter(latestGame, userId) : 1200;
		const allUserGames = await repo.allGameElos(db, userId);
		const peakElo = allUserGames.reduce(
			(peak, game) => Math.max(peak, eloAfter(game, userId)),
			1200,
		);

		stats = {
			userId,
			currentElo,
			totalGames: gameStats?.totalGames || 0,
			wins: gameStats?.wins || 0,
			losses: gameStats?.losses || 0,
			lastGameAt: gameStats?.lastGameAt || null,
			peakElo,
			createdAt: tenant.now(),
			updatedAt: tenant.now(),
		};
	}

	const recent = await repo.eloHistoryRows(db, userId);
	const eloHistory = recent
		.filter((game) => game.playedAt)
		.map((game) => ({
			date: game.playedAt ? dayKeyInTZ(game.playedAt) : "",
			elo: eloAfter(game, userId),
		}))
		.reverse();

	return { stats, eloHistory };
}
