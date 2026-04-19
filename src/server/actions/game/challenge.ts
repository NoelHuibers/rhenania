"use server";

import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import {
	challenges,
	drinks,
	games,
	orders,
	userStats,
	users,
} from "~/server/db/schema";
import { calculateEloChange, DEFAULT_ELO } from "~/server/lib/elo";
import { auth } from "../../auth";
import { checkAndUnlockAchievements } from "../achievements/tracking";
import { isEloEnabledForUser } from "../profile/preferences";

const RESPOND_WINDOW_MS = 30 * 60 * 1000; // 30 min to accept
const PLAY_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 h to propose result
const CONFIRM_WINDOW_MS = 10 * 60 * 1000; // 10 min to confirm
const DECLINE_COOLDOWN_MS = 60 * 60 * 1000; // 1 h cooldown after decline

const OPEN_STATUSES = ["pending", "accepted", "result_proposed"] as const;

export type ChallengeStatus =
	| "pending"
	| "accepted"
	| "result_proposed"
	| "confirmed"
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
	if (!drink) return { success: false, error: "Getränk nicht gefunden" };
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
	revalidatePath("/eloranking/challenges");

	return { success: true, challengeId: row?.id };
}

// ---------- Respond ----------

export async function respondToChallenge(input: {
	challengeId: string;
	response: "accept" | "decline";
}): Promise<{ success: boolean; error?: string }> {
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Nicht authentifiziert" };
	}
	const userId = session.user.id;

	const row = await db.query.challenges.findFirst({
		where: (t, { eq }) => eq(t.id, input.challengeId),
	});
	if (!row) return { success: false, error: "Herausforderung nicht gefunden" };
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
	revalidatePath("/eloranking/challenges");
	return { success: true };
}

// ---------- Cancel ----------

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
	if (!row) return { success: false, error: "Herausforderung nicht gefunden" };
	if (row.challengerId !== userId && row.opponentId !== userId) {
		return { success: false, error: "Keine Berechtigung" };
	}
	if (!OPEN_STATUSES.includes(row.status as (typeof OPEN_STATUSES)[number])) {
		return { success: false, error: "Kann nicht mehr abgebrochen werden" };
	}

	await db
		.update(challenges)
		.set({ status: "cancelled" })
		.where(eq(challenges.id, challengeId));

	revalidatePath("/eloranking");
	revalidatePath("/eloranking/challenges");
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
	if (!row) return { success: false, error: "Herausforderung nicht gefunden" };
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

	await db
		.update(challenges)
		.set({
			status: "result_proposed",
			proposedWinnerId: input.winnerId,
			proposedById: userId,
			proposedAt: new Date(),
			confirmDeadline: new Date(Date.now() + CONFIRM_WINDOW_MS),
		})
		.where(eq(challenges.id, row.id));

	revalidatePath("/eloranking");
	revalidatePath("/eloranking/challenges");
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
	if (!row) return { success: false, error: "Herausforderung nicht gefunden" };
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
	if (!row) return { success: false, error: "Herausforderung nicht gefunden" };
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

	await db
		.update(challenges)
		.set({ status: "disputed" })
		.where(eq(challenges.id, challengeId));

	revalidatePath("/eloranking");
	revalidatePath("/eloranking/challenges");
	return { success: true };
}

// ---------- Settle (internal) ----------

async function settleChallenge(
	challengeId: string,
): Promise<{ success: boolean; error?: string; gameId?: string }> {
	const row = await db.query.challenges.findFirst({
		where: (t, { eq }) => eq(t.id, challengeId),
	});
	if (!row) return { success: false, error: "Herausforderung nicht gefunden" };
	if (row.proposedWinnerId == null) {
		return { success: false, error: "Kein Gewinner vorgeschlagen" };
	}

	const winnerId = row.proposedWinnerId;
	const loserId =
		winnerId === row.challengerId ? row.opponentId : row.challengerId;

	// Fetch drink + both users in parallel
	const [drink, winner, loser, winnerStats, loserStats] = await Promise.all([
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
		getOrCreateUserStats(winnerId),
		getOrCreateUserStats(loserId),
	]);

	if (!drink) return { success: false, error: "Getränk nicht gefunden" };
	if (!winner || !loser) {
		return { success: false, error: "Spieler nicht gefunden" };
	}

	// Orders per payment rule
	const ordersToCreate: Array<{
		userId: string;
		userName: string;
		amount: number;
	}> = [];
	const challengerIsWinner = row.challengerId === winnerId;
	const winnerName = winner.name || winner.email || "Unbekannt";
	const loserName = loser.name || loser.email || "Unbekannt";
	const challengerName = challengerIsWinner ? winnerName : loserName;
	const challengerUserId = row.challengerId;

	switch (row.payment) {
		case "challenger":
			ordersToCreate.push({
				userId: challengerUserId,
				userName: challengerName,
				amount: row.quantity,
			});
			break;
		case "loser":
			ordersToCreate.push({
				userId: loserId,
				userName: loserName,
				amount: row.quantity,
			});
			break;
		case "split": {
			const each = Math.floor(row.quantity / 2);
			const rem = row.quantity - each * 2;
			// Even split; if odd remainder, challenger absorbs it
			ordersToCreate.push({
				userId: challengerUserId,
				userName: challengerName,
				amount: each + rem,
			});
			ordersToCreate.push({
				userId: challengerUserId === winnerId ? loserId : winnerId,
				userName: challengerUserId === winnerId ? loserName : winnerName,
				amount: each,
			});
			break;
		}
	}

	// Insert orders
	for (const o of ordersToCreate) {
		if (o.amount <= 0) continue;
		await db.insert(orders).values({
			userId: o.userId,
			userName: o.userName,
			drinkId: drink.id,
			drinkName: drink.name,
			amount: o.amount,
			pricePerUnit: drink.price,
			total: drink.price * o.amount,
			bookingFor: null,
		});
	}

	// ELO calc: use challenger as player1 for consistency
	const p1Won = challengerIsWinner;
	const p1Stats = challengerIsWinner ? winnerStats : loserStats;
	const p2Stats = challengerIsWinner ? loserStats : winnerStats;
	const elo = calculateEloChange(
		p1Stats.currentElo,
		p2Stats.currentElo,
		p1Stats.totalGames,
		p2Stats.totalGames,
		p1Won,
	);

	// Insert game
	const [newGame] = await db
		.insert(games)
		.values({
			player1Id: row.challengerId,
			player2Id: row.opponentId,
			winnerId,
			player1EloBefore: p1Stats.currentElo,
			player2EloBefore: p2Stats.currentElo,
			player1EloAfter: elo.player1NewElo,
			player2EloAfter: elo.player2NewElo,
			challengeId: row.id,
		})
		.returning({ id: games.id });

	if (!newGame) {
		return { success: false, error: "Spiel konnte nicht erstellt werden" };
	}

	// Update user stats
	await Promise.all([
		updateUserStats(
			row.challengerId,
			p1Won,
			elo.player1NewElo,
			p1Stats.currentElo,
		),
		updateUserStats(
			row.opponentId,
			!p1Won,
			elo.player2NewElo,
			p2Stats.currentElo,
		),
	]);

	// Mark challenge settled
	await db
		.update(challenges)
		.set({ status: "settled", gameId: newGame.id })
		.where(eq(challenges.id, row.id));

	// Fire achievements (non-blocking)
	void Promise.all([
		checkAndUnlockAchievements(row.challengerId, "game_played"),
		checkAndUnlockAchievements(row.opponentId, "game_played"),
		checkAndUnlockAchievements(winnerId, "game_won"),
		checkAndUnlockAchievements(loserId, "game_lost"),
	]);

	revalidatePath("/eloranking");
	revalidatePath("/eloranking/challenges");
	revalidatePath("/rechnung");

	return { success: true, gameId: newGame.id };
}

async function getOrCreateUserStats(userId: string) {
	const existing = await db.query.userStats.findFirst({
		where: (t, { eq }) => eq(t.userId, userId),
		columns: { currentElo: true, totalGames: true, peakElo: true },
	});
	if (existing) {
		return {
			currentElo: existing.currentElo ?? DEFAULT_ELO,
			totalGames: existing.totalGames ?? 0,
			peakElo: existing.peakElo ?? DEFAULT_ELO,
		};
	}
	await db.insert(userStats).values({
		userId,
		currentElo: DEFAULT_ELO,
		totalGames: 0,
		wins: 0,
		losses: 0,
		peakElo: DEFAULT_ELO,
	});
	return {
		currentElo: DEFAULT_ELO,
		totalGames: 0,
		peakElo: DEFAULT_ELO,
	};
}

async function updateUserStats(
	userId: string,
	won: boolean,
	newElo: number,
	_previousElo: number,
) {
	const existing = await db.query.userStats.findFirst({
		where: (t, { eq }) => eq(t.userId, userId),
	});
	if (!existing) return;
	const newPeak = Math.max(existing.peakElo ?? DEFAULT_ELO, newElo);
	await db
		.update(userStats)
		.set({
			currentElo: newElo,
			totalGames: (existing.totalGames ?? 0) + 1,
			wins: won ? (existing.wins ?? 0) + 1 : (existing.wins ?? 0),
			losses: won ? (existing.losses ?? 0) : (existing.losses ?? 0) + 1,
			peakElo: newPeak,
			lastGameAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(userStats.userId, userId));
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
	if (!session?.user?.id) return empty;
	const userId = session.user.id;

	await sweepExpiredChallenges();

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
			opponentId: challenges.opponentId,
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
		.where(
			or(
				eq(challenges.challengerId, userId),
				eq(challenges.opponentId, userId),
			),
		)
		.orderBy(desc(challenges.createdAt))
		.limit(100);

	if (rows.length === 0) return empty;

	// Fetch user info for challenger + opponent in one pass
	const userIds = new Set<string>();
	for (const r of rows) {
		userIds.add(r.challengerId);
		userIds.add(r.opponentId);
	}
	const userRows = await db
		.select({ id: users.id, name: users.name, image: users.image })
		.from(users)
		.where(inArray(users.id, [...userIds]));
	const usersById = new Map(userRows.map((u) => [u.id, u]));

	const views: ChallengeView[] = rows.map((r) => {
		const c = usersById.get(r.challengerId);
		const o = usersById.get(r.opponentId);
		return {
			id: r.id,
			status: r.status as ChallengeStatus,
			payment: r.payment as PaymentRule,
			quantity: r.quantity,
			drinkId: r.drinkId,
			drinkName: r.drinkName ?? "Unbekannt",
			drinkPrice: r.drinkPrice ?? 0,
			challengerId: r.challengerId,
			challengerName: c?.name ?? null,
			challengerAvatar: c?.image ?? null,
			opponentId: r.opponentId,
			opponentName: o?.name ?? null,
			opponentAvatar: o?.image ?? null,
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
			if (isMine) feed.outgoingPending.push(v);
			else feed.incomingPending.push(v);
		} else if (v.status === "accepted") {
			feed.active.push(v);
			feed.awaitingMyResult.push(v);
		} else if (v.status === "result_proposed") {
			feed.active.push(v);
			if (v.proposedById !== userId) feed.awaitingMyConfirm.push(v);
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

export async function sweepExpiredChallenges(): Promise<void> {
	const now = new Date();

	// pending past respondDeadline → expired
	await db
		.update(challenges)
		.set({ status: "expired" })
		.where(
			and(
				eq(challenges.status, "pending"),
				lt(challenges.respondDeadline, now),
			),
		);

	// accepted past playDeadline → expired
	await db
		.update(challenges)
		.set({ status: "expired" })
		.where(
			and(eq(challenges.status, "accepted"), lt(challenges.playDeadline, now)),
		);

	// result_proposed past confirmDeadline → auto-settle
	const autoConfirm = await db
		.select({ id: challenges.id })
		.from(challenges)
		.where(
			and(
				eq(challenges.status, "result_proposed"),
				lt(challenges.confirmDeadline, now),
			),
		);

	for (const { id } of autoConfirm) {
		await settleChallenge(id);
	}
}
