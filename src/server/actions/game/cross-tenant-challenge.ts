"use server";

// Cross-Corps challenge flow. Mirrors `challenge.ts` but operates on the
// control DB's `crossTenantChallenges` + `crossTenantGames` tables. Settles
// through the same unified `userStats` as intra-Corps games — there is one
// ELO per user, period.

import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "~/server/auth";
import { controlDb } from "~/server/db/control";
import {
	crossTenantChallenges,
	crossTenantGames,
	tenantMemberships,
	tenants,
	users,
} from "~/server/db/control-schema";
import { applyEloOutcome } from "~/server/lib/user-stats";
import { checkAndUnlockAchievements } from "../achievements/tracking";
import { isEloEnabledForUser } from "../profile/preferences";

const RESPOND_WINDOW_MS = 30 * 60 * 1000;
const PLAY_WINDOW_MS = 6 * 60 * 60 * 1000;
const CONFIRM_WINDOW_MS = 10 * 60 * 1000;

const OPEN_STATUSES = ["pending", "accepted", "result_proposed"] as const;

export type CrossChallengeStatus =
	| "pending"
	| "accepted"
	| "result_proposed"
	| "confirmed"
	| "settled"
	| "declined"
	| "expired"
	| "cancelled"
	| "disputed";

export type CrossPaymentRule = "none" | "challenger" | "loser" | "split";

export interface CrossChallengeView {
	id: string;
	status: CrossChallengeStatus;
	payment: CrossPaymentRule;
	quantity: number;
	drinkName: string | null;
	challengerId: string;
	challengerName: string | null;
	challengerTenantSlug: string;
	challengerTenantName: string;
	opponentId: string;
	opponentName: string | null;
	opponentTenantSlug: string;
	opponentTenantName: string;
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

export interface CrossChallengeFeed {
	incomingPending: CrossChallengeView[];
	outgoingPending: CrossChallengeView[];
	active: CrossChallengeView[];
	awaitingMyResult: CrossChallengeView[];
	awaitingMyConfirm: CrossChallengeView[];
	disputed: CrossChallengeView[];
	history: CrossChallengeView[];
}

// ---------- Helpers ----------

async function membershipExists(
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

async function challengerTenantId(
	challengerId: string,
): Promise<string | null> {
	// A user could in principle be in multiple Corps; pick the first one we
	// find. Real apps may want a "primary tenant" preference; punt that for v1.
	const [m] = await controlDb
		.select({ tenantId: tenantMemberships.tenantId })
		.from(tenantMemberships)
		.where(
			and(
				eq(tenantMemberships.userId, challengerId),
				eq(tenantMemberships.status, "active"),
			),
		)
		.limit(1);
	return m?.tenantId ?? null;
}

// ---------- Create ----------

export async function createCrossTenantChallenge(input: {
	opponentId: string;
	opponentTenantId: string;
	payment?: CrossPaymentRule;
	drinkName?: string | null;
	quantity?: number;
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

	// Determine challenger's tenant — must differ from opponent's.
	const myTenantId = await challengerTenantId(challengerId);
	if (!myTenantId) {
		return { success: false, error: "Du gehörst keinem Corps an" };
	}
	if (myTenantId === input.opponentTenantId) {
		return {
			success: false,
			error:
				"Mitspieler aus deinem Corps werden über die normale Herausforderung gefordert",
		};
	}

	// Opponent must actually be a member of the chosen tenant.
	const opponentOk = await membershipExists(
		input.opponentId,
		input.opponentTenantId,
	);
	if (!opponentOk) {
		return {
			success: false,
			error: "Spieler ist kein aktives Mitglied dieses Corps",
		};
	}

	// Both players must have ELO enabled (preference is per-tenant; check
	// against the relevant tenant's preference table — challenger uses theirs).
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

	await sweepExpiredCrossTenantChallenges();

	// Block if there's already an open cross-tenant challenge between these two.
	const [existingOpen] = await controlDb
		.select({ id: crossTenantChallenges.id })
		.from(crossTenantChallenges)
		.where(
			and(
				or(
					and(
						eq(crossTenantChallenges.challengerId, challengerId),
						eq(crossTenantChallenges.opponentId, input.opponentId),
					),
					and(
						eq(crossTenantChallenges.challengerId, input.opponentId),
						eq(crossTenantChallenges.opponentId, challengerId),
					),
				),
				inArray(crossTenantChallenges.status, [...OPEN_STATUSES]),
			),
		)
		.limit(1);
	if (existingOpen) {
		return {
			success: false,
			error: "Es gibt bereits eine offene Herausforderung zwischen euch",
		};
	}

	const payment: CrossPaymentRule = input.payment ?? "none";
	const quantity = Math.max(1, Math.min(input.quantity ?? 2, 100));

	const [inserted] = await controlDb
		.insert(crossTenantChallenges)
		.values({
			challengerId,
			challengerTenantId: myTenantId,
			opponentId: input.opponentId,
			opponentTenantId: input.opponentTenantId,
			status: "pending",
			payment,
			drinkName: input.drinkName ?? null,
			quantity,
			respondDeadline: new Date(Date.now() + RESPOND_WINDOW_MS),
		})
		.returning({ id: crossTenantChallenges.id });

	revalidatePath("/eloranking");
	return { success: true, challengeId: inserted?.id };
}

// ---------- Respond ----------

export async function respondToCrossTenantChallenge(input: {
	challengeId: string;
	response: "accept" | "decline";
}): Promise<{ success: boolean; error?: string }> {
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Nicht authentifiziert" };
	}
	const userId = session.user.id;

	const [row] = await controlDb
		.select()
		.from(crossTenantChallenges)
		.where(eq(crossTenantChallenges.id, input.challengeId))
		.limit(1);
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
		await controlDb
			.update(crossTenantChallenges)
			.set({ status: "expired" })
			.where(eq(crossTenantChallenges.id, row.id));
		return { success: false, error: "Herausforderung ist abgelaufen" };
	}

	if (input.response === "accept") {
		await controlDb
			.update(crossTenantChallenges)
			.set({
				status: "accepted",
				acceptedAt: new Date(),
				playDeadline: new Date(Date.now() + PLAY_WINDOW_MS),
			})
			.where(eq(crossTenantChallenges.id, row.id));
	} else {
		await controlDb
			.update(crossTenantChallenges)
			.set({ status: "declined", declinedAt: new Date() })
			.where(eq(crossTenantChallenges.id, row.id));
	}

	revalidatePath("/eloranking");
	return { success: true };
}

// ---------- Cancel ----------

export async function cancelCrossTenantChallenge(
	challengeId: string,
): Promise<{ success: boolean; error?: string }> {
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Nicht authentifiziert" };
	}
	const userId = session.user.id;

	const [row] = await controlDb
		.select({
			id: crossTenantChallenges.id,
			challengerId: crossTenantChallenges.challengerId,
			opponentId: crossTenantChallenges.opponentId,
			status: crossTenantChallenges.status,
		})
		.from(crossTenantChallenges)
		.where(eq(crossTenantChallenges.id, challengeId))
		.limit(1);
	if (!row) return { success: false, error: "Herausforderung nicht gefunden" };
	if (row.challengerId !== userId && row.opponentId !== userId) {
		return { success: false, error: "Keine Berechtigung" };
	}
	if (row.status !== "pending" && row.status !== "accepted") {
		return {
			success: false,
			error: "Diese Herausforderung kann nicht mehr abgebrochen werden",
		};
	}

	await controlDb
		.update(crossTenantChallenges)
		.set({ status: "cancelled" })
		.where(eq(crossTenantChallenges.id, challengeId));

	revalidatePath("/eloranking");
	return { success: true };
}

// ---------- Propose result ----------

export async function proposeCrossTenantResult(input: {
	challengeId: string;
	winnerId: string;
}): Promise<{ success: boolean; error?: string }> {
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Nicht authentifiziert" };
	}
	const userId = session.user.id;

	const [row] = await controlDb
		.select()
		.from(crossTenantChallenges)
		.where(eq(crossTenantChallenges.id, input.challengeId))
		.limit(1);
	if (!row) return { success: false, error: "Herausforderung nicht gefunden" };
	if (row.challengerId !== userId && row.opponentId !== userId) {
		return { success: false, error: "Keine Berechtigung" };
	}
	if (row.status !== "accepted") {
		return { success: false, error: "Spielt erst, dann das Ergebnis melden" };
	}
	if (
		input.winnerId !== row.challengerId &&
		input.winnerId !== row.opponentId
	) {
		return { success: false, error: "Ungültiger Gewinner" };
	}

	await controlDb
		.update(crossTenantChallenges)
		.set({
			status: "result_proposed",
			proposedWinnerId: input.winnerId,
			proposedById: userId,
			proposedAt: new Date(),
			confirmDeadline: new Date(Date.now() + CONFIRM_WINDOW_MS),
		})
		.where(eq(crossTenantChallenges.id, row.id));

	revalidatePath("/eloranking");
	return { success: true };
}

// ---------- Confirm result ----------

export async function confirmCrossTenantResult(
	challengeId: string,
): Promise<{ success: boolean; error?: string; gameId?: string }> {
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Nicht authentifiziert" };
	}
	const userId = session.user.id;

	const [row] = await controlDb
		.select()
		.from(crossTenantChallenges)
		.where(eq(crossTenantChallenges.id, challengeId))
		.limit(1);
	if (!row) return { success: false, error: "Herausforderung nicht gefunden" };
	if (row.status !== "result_proposed") {
		return {
			success: false,
			error: "Es liegt kein Ergebnisvorschlag vor",
		};
	}
	if (row.proposedById === userId) {
		return {
			success: false,
			error: "Der Gegner muss bestätigen, nicht der Vorschlagende",
		};
	}
	if (row.challengerId !== userId && row.opponentId !== userId) {
		return { success: false, error: "Keine Berechtigung" };
	}
	if (row.confirmDeadline && row.confirmDeadline.getTime() < Date.now()) {
		await controlDb
			.update(crossTenantChallenges)
			.set({ status: "expired" })
			.where(eq(crossTenantChallenges.id, row.id));
		return { success: false, error: "Bestätigungsfrist abgelaufen" };
	}

	return await settleCrossTenantChallenge(challengeId);
}

export async function disputeCrossTenantResult(
	challengeId: string,
): Promise<{ success: boolean; error?: string }> {
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Nicht authentifiziert" };
	}
	const userId = session.user.id;

	const [row] = await controlDb
		.select({
			id: crossTenantChallenges.id,
			status: crossTenantChallenges.status,
			challengerId: crossTenantChallenges.challengerId,
			opponentId: crossTenantChallenges.opponentId,
			proposedById: crossTenantChallenges.proposedById,
		})
		.from(crossTenantChallenges)
		.where(eq(crossTenantChallenges.id, challengeId))
		.limit(1);
	if (!row) return { success: false, error: "Herausforderung nicht gefunden" };
	if (row.status !== "result_proposed") {
		return { success: false, error: "Kein Ergebnisvorschlag offen" };
	}
	if (row.proposedById === userId) {
		return { success: false, error: "Du hast den Vorschlag selbst gemacht" };
	}
	if (row.challengerId !== userId && row.opponentId !== userId) {
		return { success: false, error: "Keine Berechtigung" };
	}

	await controlDb
		.update(crossTenantChallenges)
		.set({ status: "disputed" })
		.where(eq(crossTenantChallenges.id, challengeId));

	revalidatePath("/eloranking");
	return { success: true };
}

// ---------- Settle ----------

async function settleCrossTenantChallenge(
	challengeId: string,
): Promise<{ success: boolean; error?: string; gameId?: string }> {
	const [row] = await controlDb
		.select()
		.from(crossTenantChallenges)
		.where(eq(crossTenantChallenges.id, challengeId))
		.limit(1);
	if (!row) return { success: false, error: "Herausforderung nicht gefunden" };
	if (row.proposedWinnerId == null) {
		return { success: false, error: "Kein Gewinner vorgeschlagen" };
	}

	const winnerId = row.proposedWinnerId;
	const loserId =
		winnerId === row.challengerId ? row.opponentId : row.challengerId;

	// Apply ELO outcome — same unified userStats as intra-Corps games.
	const eloResult = await applyEloOutcome(winnerId, loserId);
	const challengerIsWinner = row.challengerId === winnerId;
	const player1EloBefore = challengerIsWinner
		? eloResult.winnerEloBefore
		: eloResult.loserEloBefore;
	const player2EloBefore = challengerIsWinner
		? eloResult.loserEloBefore
		: eloResult.winnerEloBefore;
	const player1EloAfter = challengerIsWinner
		? eloResult.winnerEloAfter
		: eloResult.loserEloAfter;
	const player2EloAfter = challengerIsWinner
		? eloResult.loserEloAfter
		: eloResult.winnerEloAfter;

	const [newGame] = await controlDb
		.insert(crossTenantGames)
		.values({
			player1Id: row.challengerId,
			player1TenantId: row.challengerTenantId,
			player2Id: row.opponentId,
			player2TenantId: row.opponentTenantId,
			winnerId,
			player1EloBefore,
			player2EloBefore,
			player1EloAfter,
			player2EloAfter,
			challengeId: row.id,
		})
		.returning({ id: crossTenantGames.id });

	if (!newGame) {
		return { success: false, error: "Spiel konnte nicht erstellt werden" };
	}

	await controlDb
		.update(crossTenantChallenges)
		.set({ status: "settled", gameId: newGame.id })
		.where(eq(crossTenantChallenges.id, row.id));

	void Promise.all([
		checkAndUnlockAchievements(row.challengerId, "game_played"),
		checkAndUnlockAchievements(row.opponentId, "game_played"),
		checkAndUnlockAchievements(winnerId, "game_won"),
		checkAndUnlockAchievements(loserId, "game_lost"),
	]);

	revalidatePath("/eloranking");
	return { success: true, gameId: newGame.id };
}

// ---------- Sweep expired ----------

export async function sweepExpiredCrossTenantChallenges(): Promise<void> {
	const now = new Date();
	// pending + past respondDeadline → expired
	await controlDb
		.update(crossTenantChallenges)
		.set({ status: "expired" })
		.where(
			and(
				eq(crossTenantChallenges.status, "pending"),
				lt(crossTenantChallenges.respondDeadline, now),
			),
		);
	// accepted + past playDeadline → expired
	await controlDb
		.update(crossTenantChallenges)
		.set({ status: "expired" })
		.where(
			and(
				eq(crossTenantChallenges.status, "accepted"),
				lt(crossTenantChallenges.playDeadline, now),
			),
		);
	// result_proposed + past confirmDeadline → expired
	await controlDb
		.update(crossTenantChallenges)
		.set({ status: "expired" })
		.where(
			and(
				eq(crossTenantChallenges.status, "result_proposed"),
				lt(crossTenantChallenges.confirmDeadline, now),
			),
		);
}

// ---------- Feed ----------

export async function getMyCrossTenantChallenges(): Promise<CrossChallengeFeed> {
	const empty: CrossChallengeFeed = {
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

	await sweepExpiredCrossTenantChallenges();

	const rows = await controlDb
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

	if (rows.length === 0) return empty;

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
		controlDb
			.select({ id: users.id, name: users.name })
			.from(users)
			.where(inArray(users.id, [...userIds])),
		controlDb
			.select({
				id: tenants.id,
				slug: tenants.slug,
				displayName: tenants.displayName,
			})
			.from(tenants)
			.where(inArray(tenants.id, [...tenantIds])),
	]);

	const userById = new Map(userRows.map((u) => [u.id, u]));
	const tenantById = new Map(tenantRows.map((t) => [t.id, t]));

	const feed: CrossChallengeFeed = {
		incomingPending: [],
		outgoingPending: [],
		active: [],
		awaitingMyResult: [],
		awaitingMyConfirm: [],
		disputed: [],
		history: [],
	};

	for (const r of rows) {
		const role: "challenger" | "opponent" =
			r.challengerId === userId ? "challenger" : "opponent";
		const challengerTenant = tenantById.get(r.challengerTenantId);
		const opponentTenant = tenantById.get(r.opponentTenantId);
		const view: CrossChallengeView = {
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
			role,
		};

		switch (r.status) {
			case "pending":
				if (role === "challenger") feed.outgoingPending.push(view);
				else feed.incomingPending.push(view);
				break;
			case "accepted":
				feed.awaitingMyResult.push(view);
				break;
			case "result_proposed":
				if (r.proposedById === userId) feed.active.push(view);
				else feed.awaitingMyConfirm.push(view);
				break;
			case "disputed":
				feed.disputed.push(view);
				break;
			default:
				feed.history.push(view);
		}
	}

	return feed;
}
