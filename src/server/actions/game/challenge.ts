"use server";

// Intra-Corps challenges: one player challenges another for a drink, the
// result is proposed by one and confirmed by the other, and settling books
// the drinks and moves the unified ELO. The mutations answer with an
// ActionResult (#216); the feed is polled by the challenge badge.

import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { orderTotal, unitPriceFor } from "~/lib/pricing";
import { auth } from "~/server/auth";
import { challenges, drinks, games, orders, users } from "~/server/db/schema";
import { ActionError, defineAction } from "~/server/lib/define-action";
import {
	ConflictError,
	DomainError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";
import { readEloEnabled } from "~/server/lib/elo-preference";
import { log } from "~/server/lib/log";
import { scopeOf, type TenantScope } from "~/server/lib/tenant-scope";
import {
	applyEloOutcome,
	type EloOutcome,
	revertEloOutcome,
} from "~/server/lib/user-stats";
import { drinkPricing } from "~/server/modules/getraenkekasse/service";
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

/** Pages that show challenges; revalidated after every change. */
const CHALLENGE_PATHS = ["/eloranking", "/challenges"];

const NOT_FOUND = "Herausforderung nicht gefunden";
const NOT_A_PLAYER = "Keine Berechtigung";

// ---------- Create ----------

const createChallengeInput = z.object({
	opponentId: z.string(),
	drinkId: z.string(),
	payment: z.enum(["challenger", "loser", "split"]),
});

export const createChallenge = defineAction(
	{
		schema: z.tuple([createChallengeInput]),
		revalidate: CHALLENGE_PATHS,
		errorMessage: "Herausforderung fehlgeschlagen",
	},
	async ([input], { tenant, user }) => {
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
		const drink = await db.query.drinks.findFirst({
			where: (t, { eq }) => eq(t.id, input.drinkId),
			columns: { id: true, isCurrentlyAvailable: true },
		});
		if (!drink) {
			throw new NotFoundError("Getränk nicht gefunden");
		}
		if (!drink.isCurrentlyAvailable) {
			throw new ConflictError("Getränk ist nicht verfügbar");
		}

		// Lazy sweep expired challenges so stale rows don't block
		await sweepExpiredChallenges(tenant);

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
			throw new ConflictError(
				"Du hast bereits eine offene Herausforderung an diesen Spieler",
			);
		}

		// Cooldown after decline (same direction)
		const now = tenant.now().getTime();
		const cooldownCutoff = new Date(now - DECLINE_COOLDOWN_MS);
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
			throw new ConflictError(
				"Bitte warte eine Stunde bevor du erneut herausforderst",
				"COOLDOWN",
			);
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
				respondDeadline: new Date(now + RESPOND_WINDOW_MS),
			})
			.returning({ id: challenges.id });
		if (!row) {
			throw new Error("challenge insert returned no row");
		}
		return { challengeId: row.id };
	},
);

// ---------- Respond ----------

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
	async ([input], { tenant, user }) => {
		const { db } = tenant;
		const row = await db.query.challenges.findFirst({
			where: (t, { eq }) => eq(t.id, input.challengeId),
		});
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
			await db
				.update(challenges)
				.set({ status: "expired" })
				.where(eq(challenges.id, row.id));
			throw new ConflictError("Herausforderung ist abgelaufen", "EXPIRED");
		}

		if (input.response === "accept") {
			await db
				.update(challenges)
				.set({
					status: "accepted",
					acceptedAt: now,
					playDeadline: new Date(now.getTime() + PLAY_WINDOW_MS),
				})
				.where(eq(challenges.id, row.id));
		} else {
			await db
				.update(challenges)
				.set({ status: "declined", declinedAt: now })
				.where(eq(challenges.id, row.id));
		}
	},
);

// ---------- Cancel ----------

const RESULT_PROPOSED_ERROR =
	"Ein Ergebnis wurde gemeldet: bestätigen oder anfechten";
const NOT_CANCELLABLE = "Kann nicht mehr abgebrochen werden";

export const cancelChallenge = defineAction(
	{ schema: z.tuple([z.string()]), revalidate: CHALLENGE_PATHS },
	async ([challengeId], { tenant, user }) => {
		const { db } = tenant;
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
			throw new NotFoundError(NOT_FOUND);
		}
		if (row.challengerId !== user.id && row.opponentId !== user.id) {
			throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
		}
		if (row.status === "result_proposed") {
			throw new ConflictError(RESULT_PROPOSED_ERROR);
		}
		if (
			!CANCELLABLE_STATUSES.includes(
				row.status as (typeof CANCELLABLE_STATUSES)[number],
			)
		) {
			throw new ConflictError(NOT_CANCELLABLE);
		}

		// Only from the status checked above: a proposal or the sweep may move
		// it on meanwhile.
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
			throw new ConflictError(NOT_CANCELLABLE);
		}
	},
);

// ---------- Propose result ----------

const NOT_RUNNING = "Ergebnis kann nur in laufenden Spielen gemeldet werden";

export const proposeResult = defineAction(
	{
		schema: z.tuple([
			z.object({ challengeId: z.string(), winnerId: z.string() }),
		]),
		revalidate: CHALLENGE_PATHS,
	},
	async ([input], { tenant, user }) => {
		const { db } = tenant;
		const row = await db.query.challenges.findFirst({
			where: (t, { eq }) => eq(t.id, input.challengeId),
		});
		if (!row) {
			throw new NotFoundError(NOT_FOUND);
		}
		if (row.challengerId !== user.id && row.opponentId !== user.id) {
			throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
		}
		if (row.status !== "accepted") {
			throw new ConflictError(NOT_RUNNING);
		}
		if (
			input.winnerId !== row.challengerId &&
			input.winnerId !== row.opponentId
		) {
			throw new ValidationError("Ungültiger Gewinner");
		}

		// Only from "accepted": a cancel or the sweep may have closed it
		// meanwhile.
		const now = tenant.now();
		const [proposed] = await db
			.update(challenges)
			.set({
				status: "result_proposed",
				proposedWinnerId: input.winnerId,
				proposedById: user.id,
				proposedAt: now,
				confirmDeadline: new Date(now.getTime() + CONFIRM_WINDOW_MS),
			})
			.where(and(eq(challenges.id, row.id), eq(challenges.status, "accepted")))
			.returning({ id: challenges.id });
		if (!proposed) {
			throw new ConflictError(NOT_RUNNING);
		}
	},
);

// ---------- Confirm result ----------

const NOTHING_TO_CONFIRM = "Kein Ergebnis zum Bestätigen";

export const confirmResult = defineAction(
	{
		schema: z.tuple([z.string()]),
		errorMessage:
			"Das Ergebnis konnte nicht gebucht werden. Bitte versuche es erneut.",
	},
	async ([challengeId], { tenant, user }) => {
		const row = await tenant.db.query.challenges.findFirst({
			where: (t, { eq }) => eq(t.id, challengeId),
		});
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
		if (row.challengerId !== user.id && row.opponentId !== user.id) {
			throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
		}

		// Revalidates the pages itself: the sweep settles too.
		return await settleChallenge(tenant, row.id);
	},
);

// ---------- Dispute result ----------

const NOTHING_TO_DISPUTE = "Nichts anzufechten";

export const disputeResult = defineAction(
	{ schema: z.tuple([z.string()]), revalidate: CHALLENGE_PATHS },
	async ([challengeId], { tenant, user }) => {
		const { db } = tenant;
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
		if (row.challengerId !== user.id && row.opponentId !== user.id) {
			throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
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
			throw new ConflictError(NOTHING_TO_DISPUTE);
		}
	},
);

// ---------- Settle (internal) ----------

/**
 * Atomically moves a proposed result into settlement. Of any number of
 * concurrent callers (double-tapped confirm, two auto-settle sweeps) exactly
 * one gets the row back; everyone else gets `undefined` and books nothing.
 */
async function claimProposedResult(scope: TenantScope, challengeId: string) {
	const [row] = await scope.db
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
async function releaseClaim(scope: TenantScope, challengeId: string) {
	await scope.db
		.update(challenges)
		.set({ status: "result_proposed" })
		.where(
			and(eq(challenges.id, challengeId), eq(challenges.status, "confirmed")),
		);
}

type ClaimedChallenge = typeof challenges.$inferSelect;

type PlannedOrder = { userId: string; userName: string; amount: number };

/** Reads what settling needs; throws a DomainError if something is missing. */
async function planSettlement(scope: TenantScope, row: ClaimedChallenge) {
	if (row.proposedWinnerId == null) {
		throw new ConflictError("Kein Gewinner vorgeschlagen");
	}
	const { db } = scope;
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
		drinkPricing(scope),
	]);
	if (!drink) {
		throw new NotFoundError("Getränk nicht gefunden");
	}
	if (!winner || !loser) {
		throw new NotFoundError("Spieler nicht gefunden");
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

/**
 * Books a proposed result: game row, unified ELO, the drinks. Throws a
 * DomainError when there is nothing (left) to settle.
 */
async function settleChallenge(
	scope: TenantScope,
	challengeId: string,
): Promise<{ gameId: string }> {
	const { tenantId, db } = scope;
	const row = await claimProposedResult(scope, challengeId);
	if (!row) {
		throw new ConflictError(NOTHING_TO_CONFIRM);
	}

	// Until the ELO is applied, giving the claim back undoes everything.
	let plan: Awaited<ReturnType<typeof planSettlement>>;
	let elo: EloOutcome;
	try {
		plan = await planSettlement(scope, row);
		// Unified userStats (control DB), atomic for both players.
		elo = await applyEloOutcome(plan.winnerId, plan.loserId);
	} catch (error) {
		await releaseClaim(scope, row.id);
		throw error;
	}

	const { winnerId, loserId, challengerIsWinner, orderRows } = plan;
	const gameId = crypto.randomUUID();
	try {
		// Orders, game and final status land together or not at all.
		await db.batch([
			db.insert(games).values({
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
			db
				.update(challenges)
				.set({ status: "settled", gameId })
				.where(
					and(eq(challenges.id, row.id), eq(challenges.status, "confirmed")),
				),
			...orderRows.map((o) => db.insert(orders).values(o)),
		]);
	} catch (error) {
		// Take the ELO back first; if that fails too, the claim stays so
		// nobody applies it a second time.
		await revertEloOutcome(winnerId, loserId, elo);
		await releaseClaim(scope, row.id);
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

	return { gameId };
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
	if (!session) {
		return empty;
	}
	const userId = session.user.id;
	const scope = await scopeOf(session.tenantId);

	await sweepExpiredChallenges(scope);

	// Challenge, drink and both players in one query.
	const challenger = alias(users, "challenger");
	const opponent = alias(users, "opponent");
	const rows = await scope.db
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
async function sweepExpiredChallenges(scope: TenantScope): Promise<void> {
	const { db } = scope;
	const now = scope.now();
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
			await settleChallenge(scope, id);
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
