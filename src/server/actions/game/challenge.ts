"use server";

import { and, desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { challenges, drinks, users } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";
import { settleChallenge } from "~/server/lib/challenge-settlement";
import {
	expireOverdueChallenges,
	shownChallengeStatus,
} from "~/server/lib/challenge-sweep";
import { requireTenantId } from "~/server/lib/tenant-context";
import { auth } from "../../auth";
import { isEloEnabledForUser } from "../profile/preferences";

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
	| "confirmed" // claimed: settlement in progress (lib/challenge-settlement)
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

	// Expire stale rows so they don't block (results are settled by the sweep)
	await expireOverdueChallenges(db);

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

	return await settleChallenge(
		{ tenantId: await requireTenantId(), db: await getCurrentTenantDb() },
		row.id,
	);
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

	// Challenge, drink and both players in one query. Reads never write:
	// expiry and auto-settle run from the scheduled sweep, and until it has
	// run, overdue rows are shown as it will leave them.
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

	const now = new Date();
	const views: ChallengeView[] = rows.map((r) => {
		return {
			id: r.id,
			status: shownChallengeStatus(r, now) as ChallengeStatus,
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
