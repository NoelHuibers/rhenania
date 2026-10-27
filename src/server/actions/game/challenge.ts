"use server";

import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { orderTotal, unitPriceFor } from "~/lib/pricing";
import { db } from "~/server/db";
import { challenges, drinks, games, orders, users } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";
import { getDrinkPricingConfig } from "~/server/lib/getraenke-settings";
import { log } from "~/server/lib/log";
import { isEloEnabledForUser } from "~/server/lib/preferences";
import { requireTenantId } from "~/server/lib/tenant-context";
import {
	applyEloOutcome,
	type EloOutcome,
	revertEloOutcome,
} from "~/server/lib/user-stats";
import { auth } from "../../auth";
import { checkAndUnlockAchievements } from "../achievements/tracking";

const RESPOND_WINDOW_MS = 30 * 60 * 1000; // 30 min to accept
const PLAY_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 h to propose result
const CONFIRM_WINDOW_MS = 10 * 60 * 1000; // 10 min to confirm
const DECLINE_COOLDOWN_MS = 60 * 60 * 1000; // 1 h cooldown after decline

const OPEN_STATUSES = ["pending", "accepted", "result_proposed"] as const;
// Once a result is proposed it can only be confirmed or disputed (#142):
// otherwise the reported loser could cancel and skip the drinks.
const CANCELLABLE_STATUSES = ["pending", "accepted"] as const;

export type ChallengeStatus =
	| "pending"
	| "accepted"
	| "result_proposed"
	| "confirmed" // claimed: settlement in progress (see settle below)
	| "settled"
	| "declined"
	| "expired"
	| "cancelled"
	| "disputed";

export type PaymentRule = "challenger" | "loser" | "split";

export interface ChallengeView {
	id: string;
	status: ChallengeStatus;
	payment: PaymentRule;
	quantity: number;
	drinkId: string;
	drinkName: string;
	drinkPrice: number;
	challengerId: string;
	challengerName: string | null;
	challengerAvatar: string | null;
	opponentId: string;
	opponentName: string | null;
	opponentAvatar: string | null;
	proposedWinnerId: string | null;
	proposedById: string | null;
	createdAt: Date;
	acceptedAt: Date | null;
	respondDeadline: Date;
	playDeadline: Date | null;
	confirmDeadline: Date | null;
	gameId: string | null;
	role: "challenger" | "opponent";
}

export interface ChallengeFeed {
	incomingPending: ChallengeView[];
	outgoingPending: ChallengeView[];
	active: ChallengeView[];
	awaitingMyResult: ChallengeView[]; // accepted, I haven't proposed yet
	awaitingMyConfirm: ChallengeView[]; // result_proposed by opponent, I must confirm
	disputed: ChallengeView[];
	history: ChallengeView[];
}

// ---------- Create ----------

export async function createChallenge(input: {
	opponentId: string;
	drinkId: string;
	payment: PaymentRule;
}): Promise<{ success: boolean; challengeId?: string; error?: string }> {
	const db = await getCurrentTenantDb();
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Nicht authentifiziert" };
	}
	const challengerId = session.user.id;

	if (challengerId === input.opponentId) {
		return {
			success: false,
			error: "Du kannst dich nicht selbst herausfordern",
		};
	}

	// Both players must have ELO enabled
	const [challengerEnabled, opponentEnabled] = await Promise.all([
		isEloEnabledForUser(challengerId),
		isEloEnabledForUser(input.opponentId),
	]);
	if (!challengerEnabled) {
		return {
			success: false,
			error: "Aktiviere Eloranking in deinen Einstellungen",
		};
	}
	if (!opponentEnabled) {
		return {
			success: false,
			error: "Dieser Spieler nimmt nicht am Eloranking teil",
		};
	}

	// Drink must exist and be available
	const drink = await db.query.drinks.findFirst({
		where: (t, { eq }) => eq(t.id, input.drinkId),
		columns: { id: true, isCurrentlyAvailable: true },
	});
	if (!drink) {
		return { success: false, error: "Getränk nicht gefunden" };
	}
	if (!drink.isCurrentlyAvailable) {
		return { success: false, error: "Getränk ist nicht verfügbar" };
	}

	// Lazy sweep expired challenges so stale rows don't block
	await sweepExpiredChallenges();

	// At most one open challenge in the same direction
	const existingOpen = await db.query.challenges.findFirst({
		where: (t, { and, eq, inArray }) =>
			and(
				eq(t.challengerId, challengerId),
				eq(t.opponentId, input.opponentId),
				inArray(t.status, [...OPEN_STATUSES]),
			),
		columns: { id: true },
	});
	if (existingOpen) {
		return {
			success: false,
			error: "Du hast bereits eine offene Herausforderung an diesen Spieler",
		};
	}

	// Cooldown after decline (same direction)
	const cooldownCutoff = new Date(Date.now() - DECLINE_COOLDOWN_MS);
	const recentDecline = await db.query.challenges.findFirst({
		where: (t, { and, eq, gt }) =>
			and(
				eq(t.challengerId, challengerId),
				eq(t.opponentId, input.opponentId),
				eq(t.status, "declined"),
				gt(t.declinedAt, cooldownCutoff),
			),
		columns: { declinedAt: true },
		orderBy: (t, { desc }) => [desc(t.declinedAt)],
	});
	if (recentDecline) {
		return {
			success: false,
			error: "Bitte warte eine Stunde bevor du erneut herausforderst",
		};
	}

	const [row] = await db
		.insert(challenges)
		.values({
			challengerId,
			opponentId: input.opponentId,
			drinkId: input.drinkId,
			payment: input.payment,
			quantity: 2,
			status: "pending",
			respondDeadline: new Date(Date.now() + RESPOND_WINDOW_MS),
		})
		.returning({ id: challenges.id });

	revalidatePath("/eloranking");
	revalidatePath("/challenges");

	return { success: true, challengeId: row?.id };
}

// ---------- Respond ----------

export async function respondToChallenge(input: {
	challengeId: string;
	response: "accept" | "decline";
}): Promise<{ success: boolean; error?: string }> {
	const db = await getCurrentTenantDb();
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Nicht authentifiziert" };
	}
	const userId = session.user.id;

	const row = await db.query.challenges.findFirst({
		where: (t, { eq }) => eq(t.id, input.challengeId),
	});
	if (!row) {
		return { success: false, error: "Herausforderung nicht gefunden" };
	}
	if (row.opponentId !== userId) {
		return { success: false, error: "Nur der Herausgeforderte kann antworten" };
	}
	if (row.status !== "pending") {
		return {
			success: false,
			error: "Diese Herausforderung kann nicht mehr beantwortet werden",
		};
	}
	if (row.respondDeadline.getTime() < Date.now()) {
		await db
			.update(challenges)
			.set({ status: "expired" })
			.where(eq(challenges.id, row.id));
		return { success: false, error: "Herausforderung ist abgelaufen" };
	}

	if (input.response === "accept") {
		await db
			.update(challenges)
			.set({
				status: "accepted",
				acceptedAt: new Date(),
				playDeadline: new Date(Date.now() + PLAY_WINDOW_MS),
			})
			.where(eq(challenges.id, row.id));
	} else {
		await db
			.update(challenges)
			.set({ status: "declined", declinedAt: new Date() })
			.where(eq(challenges.id, row.id));
	}

	revalidatePath("/eloranking");
	revalidatePath("/challenges");
	return { success: true };
}

// ---------- Cancel ----------

const RESULT_PROPOSED_ERROR =
	"Ein Ergebnis wurde gemeldet: bestätigen oder anfechten";

export async function cancelChallenge(
	challengeId: string,
): Promise<{ success: boolean; error?: string }> {
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Nicht authentifiziert" };
	}
	const userId = session.user.id;

	const row = await db.query.challenges.findFirst({
		where: (t, { eq }) => eq(t.id, challengeId),
		columns: {
			id: true,
			challengerId: true,
			opponentId: true,
			status: true,
		},
	});
	if (!row) {
		return { success: false, error: "Herausforderung nicht gefunden" };
	}
	if (row.challengerId !== userId && row.opponentId !== userId) {
		return { success: false, error: "Keine Berechtigung" };
	}
	if (row.status === "result_proposed") {
		return { success: false, error: RESULT_PROPOSED_ERROR };
	}
	if (
		!CANCELLABLE_STATUSES.includes(
			row.status as (typeof CANCELLABLE_STATUSES)[number],
		)
	) {
		return { success: false, error: "Kann nicht mehr abgebrochen werden" };
	}

	// Only from the status checked above: a proposal or the sweep may move it
	// on meanwhile.
	const [cancelled] = await db
		.update(challenges)
		.set({ status: "cancelled" })
		.where(
			and(
				eq(challenges.id, challengeId),
				inArray(challenges.status, [...CANCELLABLE_STATUSES]),
			),
		)
		.returning({ id: challenges.id });
	if (!cancelled) {
		return { success: false, error: "Kann nicht mehr abgebrochen werden" };
	}

	revalidatePath("/eloranking");
	revalidatePath("/challenges");
	return { success: true };
}

// ---------- Propose result ----------

export async function proposeResult(input: {
	challengeId: string;
	winnerId: string;
}): Promise<{ success: boolean; error?: string }> {
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Nicht authentifiziert" };
	}
	const userId = session.user.id;

	const row = await db.query.challenges.findFirst({
		where: (t, { eq }) => eq(t.id, input.challengeId),
	});
	if (!row) {
		return { success: false, error: "Herausforderung nicht gefunden" };
	}
	if (row.challengerId !== userId && row.opponentId !== userId) {
		return { success: false, error: "Keine Berechtigung" };
	}
	if (row.status !== "accepted") {
		return {
			success: false,
			error: "Ergebnis kann nur in laufenden Spielen gemeldet werden",
		};
	}
	if (
		input.winnerId !== row.challengerId &&
		input.winnerId !== row.opponentId
	) {
		return { success: false, error: "Ungültiger Gewinner" };
	}

	// Only from "accepted": a cancel or the sweep may have closed it meanwhile.
	const [proposed] = await db
		.update(challenges)
		.set({
			status: "result_proposed",
			proposedWinnerId: input.winnerId,
			proposedById: userId,
			proposedAt: new Date(),
			confirmDeadline: new Date(Date.now() + CONFIRM_WINDOW_MS),
		})
		.where(and(eq(challenges.id, row.id), eq(challenges.status, "accepted")))
		.returning({ id: challenges.id });
	if (!proposed) {
		return {
			success: false,
			error: "Ergebnis kann nur in laufenden Spielen gemeldet werden",
		};
	}

	revalidatePath("/eloranking");
	revalidatePath("/challenges");
	return { success: true };
}

// ---------- Confirm result ----------

export async function confirmResult(
	challengeId: string,
): Promise<{ success: boolean; error?: string; gameId?: string }> {
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Nicht authentifiziert" };
	}
	const userId = session.user.id;

	const row = await db.query.challenges.findFirst({
		where: (t, { eq }) => eq(t.id, challengeId),
	});
	if (!row) {
		return { success: false, error: "Herausforderung nicht gefunden" };
	}
	if (row.status !== "result_proposed") {
		return { success: false, error: "Kein Ergebnis zum Bestätigen" };
	}
	// Only the non-proposer can confirm
	if (row.proposedById === userId) {
		return {
			success: false,
			error: "Der Gegenspieler muss das Ergebnis bestätigen",
		};
	}
	if (row.challengerId !== userId && row.opponentId !== userId) {
		return { success: false, error: "Keine Berechtigung" };
	}

	return await settleChallenge(row.id);
}

// ---------- Dispute result ----------

export async function disputeResult(
	challengeId: string,
): Promise<{ success: boolean; error?: string }> {
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Nicht authentifiziert" };
	}
	const userId = session.user.id;

	const row = await db.query.challenges.findFirst({
		where: (t, { eq }) => eq(t.id, challengeId),
		columns: {
			id: true,
			proposedById: true,
			challengerId: true,
			opponentId: true,
			status: true,
		},
	});
	if (!row) {
		return { success: false, error: "Herausforderung nicht gefunden" };
	}
	if (row.status !== "result_proposed") {
		return { success: false, error: "Nichts anzufechten" };
	}
	if (row.proposedById === userId) {
		return {
			success: false,
			error: "Du kannst dein eigenes Ergebnis nicht anfechten",
		};
	}
	if (row.challengerId !== userId && row.opponentId !== userId) {
		return { success: false, error: "Keine Berechtigung" };
	}

	const [disputed] = await db
		.update(challenges)
		.set({ status: "disputed" })
		.where(
			and(
				eq(challenges.id, challengeId),
				eq(challenges.status, "result_proposed"),
			),
		)
		.returning({ id: challenges.id });
	if (!disputed) {
		return { success: false, error: "Nichts anzufechten" };
	}

	revalidatePath("/eloranking");
	revalidatePath("/challenges");
	return { success: true };
}

// ---------- Settle (internal) ----------

/**
 * Atomically moves a proposed result into settlement. Of any number of
 * concurrent callers (double-tapped confirm, two auto-settle sweeps) exactly
 * one gets the row back; everyone else gets `undefined` and books nothing.
 */
async function claimProposedResult(challengeId: string) {
	const [row] = await db
		.update(challenges)
		.set({ status: "confirmed" })
		.where(
			and(
				eq(challenges.id, challengeId),
				eq(challenges.status, "result_proposed"),
			),
		)
		.returning();
	return row;
}

/** Hands a claimed challenge back so the result can be confirmed again. */
async function releaseClaim(challengeId: string) {
	await db
		.update(challenges)
		.set({ status: "result_proposed" })
		.where(
			and(eq(challenges.id, challengeId), eq(challenges.status, "confirmed")),
		);
}

type ClaimedChallenge = typeof challenges.$inferSelect;

type PlannedOrder = { userId: string; userName: string; amount: number };

/** Reads what settling needs; returns an error message if something is missing. */
async function planSettlement(row: ClaimedChallenge) {
	if (row.proposedWinnerId == null) {
		return { error: "Kein Gewinner vorgeschlagen" } as const;
	}
	const winnerId = row.proposedWinnerId;
	const loserId =
		winnerId === row.challengerId ? row.opponentId : row.challengerId;

	const [drink, winner, loser, pricing] = await Promise.all([
		db.query.drinks.findFirst({
			where: (t, { eq }) => eq(t.id, row.drinkId),
		}),
		db.query.users.findFirst({
			where: (t, { eq }) => eq(t.id, winnerId),
			columns: { id: true, name: true, email: true },
		}),
		db.query.users.findFirst({
			where: (t, { eq }) => eq(t.id, loserId),
			columns: { id: true, name: true, email: true },
		}),
		getDrinkPricingConfig(),
	]);
	if (!drink) {
		return { error: "Getränk nicht gefunden" } as const;
	}
	if (!winner || !loser) {
		return { error: "Spieler nicht gefunden" } as const;
	}

	// Orders per payment rule
	const planned: PlannedOrder[] = [];
	const challengerIsWinner = row.challengerId === winnerId;
	const winnerName = winner.name || winner.email || "Unbekannt";
	const loserName = loser.name || loser.email || "Unbekannt";
	const challengerName = challengerIsWinner ? winnerName : loserName;
	const challengerUserId = row.challengerId;

	switch (row.payment) {
		case "challenger":
			planned.push({
				userId: challengerUserId,
				userName: challengerName,
				amount: row.quantity,
			});
			break;
		case "loser":
			planned.push({
				userId: loserId,
				userName: loserName,
				amount: row.quantity,
			});
			break;
		case "split": {
			const each = Math.floor(row.quantity / 2);
			const rem = row.quantity - each * 2;
			// Even split; if odd remainder, challenger absorbs it
			planned.push({
				userId: challengerUserId,
				userName: challengerName,
				amount: each + rem,
			});
			planned.push({
				userId: challengerIsWinner ? loserId : winnerId,
				userName: challengerIsWinner ? loserName : winnerName,
				amount: each,
			});
			break;
		}
	}

	// Challenge drinks are personal orders, so they carry the tenant's markup
	// when that feature is on.
	const pricePerUnit = unitPriceFor(drink.price, pricing.markupPercent, null);
	const orderRows = planned
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

	return { winnerId, loserId, challengerIsWinner, orderRows } as const;
}

async function settleChallenge(
	challengeId: string,
): Promise<{ success: boolean; error?: string; gameId?: string }> {
	const tenantId = await requireTenantId();
	const row = await claimProposedResult(challengeId);
	if (!row) {
		return { success: false, error: "Kein Ergebnis zum Bestätigen" };
	}

	// Until the ELO is applied, giving the claim back undoes everything.
	let plan: Awaited<ReturnType<typeof planSettlement>>;
	let elo: EloOutcome;
	try {
		plan = await planSettlement(row);
		if ("error" in plan) {
			await releaseClaim(row.id);
			return { success: false, error: plan.error };
		}
		// Unified userStats (control DB), atomic for both players.
		elo = await applyEloOutcome(plan.winnerId, plan.loserId);
	} catch (error) {
		await releaseClaim(row.id);
		throw error;
	}

	const { winnerId, loserId, challengerIsWinner, orderRows } = plan;
	const gameId = crypto.randomUUID();
	const tenantDb = await getCurrentTenantDb();
	try {
		// Orders, game and final status land together or not at all.
		await tenantDb.batch([
			tenantDb.insert(games).values({
				id: gameId,
				player1Id: row.challengerId,
				player2Id: row.opponentId,
				winnerId,
				player1EloBefore: challengerIsWinner
					? elo.winnerEloBefore
					: elo.loserEloBefore,
				player2EloBefore: challengerIsWinner
					? elo.loserEloBefore
					: elo.winnerEloBefore,
				player1EloAfter: challengerIsWinner
					? elo.winnerEloAfter
					: elo.loserEloAfter,
				player2EloAfter: challengerIsWinner
					? elo.loserEloAfter
					: elo.winnerEloAfter,
				challengeId: row.id,
			}),
			tenantDb
				.update(challenges)
				.set({ status: "settled", gameId })
				.where(
					and(eq(challenges.id, row.id), eq(challenges.status, "confirmed")),
				),
			...orderRows.map((o) => tenantDb.insert(orders).values(o)),
		]);
	} catch (error) {
		// Take the ELO back first; if that fails too, the claim stays so
		// nobody applies it a second time.
		await revertEloOutcome(winnerId, loserId, elo);
		await releaseClaim(row.id);
		throw error;
	}

	// Achievements run after the response, against this Corps explicitly.
	after(() =>
		Promise.all([
			checkAndUnlockAchievements(row.challengerId, "game_played", undefined, {
				tenantId,
			}),
			checkAndUnlockAchievements(row.opponentId, "game_played", undefined, {
				tenantId,
			}),
			checkAndUnlockAchievements(winnerId, "game_won", undefined, { tenantId }),
			checkAndUnlockAchievements(loserId, "game_lost", undefined, { tenantId }),
		]),
	);

	revalidatePath("/eloranking");
	revalidatePath("/challenges");
	revalidatePath("/rechnung");

	return { success: true, gameId };
}

// Local `getOrCreateUserStats` / `updateUserStats` helpers were removed —
// see `~/server/lib/user-stats.ts` for the unified control-DB versions.

// ---------- Feed ----------

export async function getMyChallenges(): Promise<ChallengeFeed> {
	const empty: ChallengeFeed = {
		incomingPending: [],
		outgoingPending: [],
		active: [],
		awaitingMyResult: [],
		awaitingMyConfirm: [],
		disputed: [],
		history: [],
	};

	const session = await auth();
	if (!session?.user?.id) {
		return empty;
	}
	const userId = session.user.id;

	await sweepExpiredChallenges();

	// Challenge, drink and both players in one query.
	const challenger = alias(users, "challenger");
	const opponent = alias(users, "opponent");
	const rows = await db
		.select({
			id: challenges.id,
			status: challenges.status,
			payment: challenges.payment,
			quantity: challenges.quantity,
			drinkId: challenges.drinkId,
			drinkName: drinks.name,
			drinkPrice: drinks.price,
			challengerId: challenges.challengerId,
			challengerName: challenger.name,
			challengerAvatar: challenger.image,
			opponentId: challenges.opponentId,
			opponentName: opponent.name,
			opponentAvatar: opponent.image,
			proposedWinnerId: challenges.proposedWinnerId,
			proposedById: challenges.proposedById,
			createdAt: challenges.createdAt,
			acceptedAt: challenges.acceptedAt,
			respondDeadline: challenges.respondDeadline,
			playDeadline: challenges.playDeadline,
			confirmDeadline: challenges.confirmDeadline,
			gameId: challenges.gameId,
		})
		.from(challenges)
		.leftJoin(drinks, eq(challenges.drinkId, drinks.id))
		.leftJoin(challenger, eq(challenges.challengerId, challenger.id))
		.leftJoin(opponent, eq(challenges.opponentId, opponent.id))
		.where(
			or(
				eq(challenges.challengerId, userId),
				eq(challenges.opponentId, userId),
			),
		)
		.orderBy(desc(challenges.createdAt))
		.limit(100);

	if (rows.length === 0) {
		return empty;
	}

	const views: ChallengeView[] = rows.map((r) => {
		return {
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
		};
	});

	const feed: ChallengeFeed = {
		incomingPending: [],
		outgoingPending: [],
		active: [],
		awaitingMyResult: [],
		awaitingMyConfirm: [],
		disputed: [],
		history: [],
	};

	for (const v of views) {
		const isMine = v.role === "challenger";

		if (v.status === "pending") {
			if (isMine) {
				feed.outgoingPending.push(v);
			} else {
				feed.incomingPending.push(v);
			}
		} else if (v.status === "accepted") {
			feed.active.push(v);
			feed.awaitingMyResult.push(v);
		} else if (v.status === "result_proposed") {
			feed.active.push(v);
			if (v.proposedById !== userId) {
				feed.awaitingMyConfirm.push(v);
			}
		} else if (v.status === "disputed") {
			feed.disputed.push(v);
			feed.active.push(v);
		} else {
			feed.history.push(v);
		}
	}

	return feed;
}

// ---------- Sweeper ----------

/**
 * Expires unanswered and unplayed challenges and auto-settles results nobody
 * confirmed in time. Every open page polls the challenge feed, so the sweep
 * first looks (one indexed read) and only writes when something is due: an
 * UPDATE that matches nothing still takes the write lock on the primary.
 */
async function sweepExpiredChallenges(): Promise<void> {
	const now = new Date();
	const respondMissed = and(
		eq(challenges.status, "pending"),
		lt(challenges.respondDeadline, now),
	);
	const playMissed = and(
		eq(challenges.status, "accepted"),
		lt(challenges.playDeadline, now),
	);
	const confirmMissed = and(
		eq(challenges.status, "result_proposed"),
		lt(challenges.confirmDeadline, now),
	);

	const due = await db
		.select({ id: challenges.id, status: challenges.status })
		.from(challenges)
		.where(or(respondMissed, playMissed, confirmMissed));
	if (due.length === 0) {
		return;
	}

	// pending past respondDeadline / accepted past playDeadline → expired.
	// The UPDATE re-checks both, so a reply landing meanwhile is kept.
	if (due.some((c) => c.status !== "result_proposed")) {
		await db
			.update(challenges)
			.set({ status: "expired" })
			.where(or(respondMissed, playMissed));
	}

	// result_proposed past confirmDeadline → auto-settle. Each settlement
	// claims its row first, so concurrent sweeps (every open page polls this)
	// book every challenge exactly once.
	for (const { id, status } of due) {
		if (status !== "result_proposed") {
			continue;
		}
		try {
			await settleChallenge(id);
		} catch (error) {
			await log.error("challenge auto-settle failed", {
				challengeId: id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
