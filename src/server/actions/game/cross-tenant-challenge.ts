"use server";

// Cross-Corps challenge flow. Mirrors `challenge.ts` but operates on the
// control DB's `crossTenantChallenges` + `crossTenantGames` tables. Settles
// through the same unified `userStats` as intra-Corps games — there is one
// ELO per user, period. The mutations answer with an ActionResult (#216):
// the caller's own Corps is the guard's; the opponent's Corps is opened
// explicitly with `scopeOf`.

import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";

import { auth } from "~/server/auth";
import { controlDb } from "~/server/db/control";
import {
	crossTenantChallenges,
	crossTenantGames,
	tenantMemberships,
	tenants,
	users,
} from "~/server/db/control-schema";
import { ActionError, defineAction } from "~/server/lib/define-action";
import {
	ConflictError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";
import { readEloEnabled } from "~/server/lib/elo-preference";
import { scopeOf } from "~/server/lib/tenant-scope";
import {
	applyEloOutcome,
	type EloOutcome,
	revertEloOutcome,
} from "~/server/lib/user-stats";
import {
	type AchievementEvent,
	checkAndUnlockAchievements,
} from "~/server/modules/achievements/tracking";

const RESPOND_WINDOW_MS = 30 * 60 * 1000;
const PLAY_WINDOW_MS = 6 * 60 * 60 * 1000;
const CONFIRM_WINDOW_MS = 10 * 60 * 1000;

const OPEN_STATUSES = ["pending", "accepted", "result_proposed"] as const;

export type CrossChallengeStatus =
	| "pending"
	| "accepted"
	| "result_proposed"
	| "confirmed" // claimed: settlement in progress (see settle below)
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

/** Pages that show cross-Corps challenges; revalidated after every change. */
const CROSS_CHALLENGE_PATHS = ["/eloranking"];

const NOT_FOUND = "Herausforderung nicht gefunden";
const NOT_A_PLAYER = "Keine Berechtigung";

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

/** The opponent's ELO switch, read from their own Corps' DB. */
async function isEloEnabledInCorps(
	userId: string,
	tenantId: string,
): Promise<boolean> {
	try {
		return await readEloEnabled((await scopeOf(tenantId)).db, userId);
	} catch {
		// Corps DB unavailable (e.g. suspended): no ranked games with it.
		return false;
	}
}

/** The challenge row; throws NotFoundError if there is none. */
async function crossChallenge(challengeId: string) {
	const [row] = await controlDb
		.select()
		.from(crossTenantChallenges)
		.where(eq(crossTenantChallenges.id, challengeId))
		.limit(1);
	if (!row) {
		throw new NotFoundError(NOT_FOUND);
	}
	return row;
}

// ---------- Create ----------

const createCrossChallengeInput = z.object({
	opponentId: z.string(),
	opponentTenantId: z.string(),
	payment: z.enum(["none", "challenger", "loser", "split"]).optional(),
	drinkName: z.string().nullish(),
	quantity: z.number().optional(),
});

export const createCrossTenantChallenge = defineAction(
	{
		schema: z.tuple([createCrossChallengeInput]),
		revalidate: CROSS_CHALLENGE_PATHS,
		errorMessage: "Fehler beim Erstellen",
	},
	async ([input], { tenant, user }) => {
		const challengerId = user.id;

		if (challengerId === input.opponentId) {
			throw new ValidationError("Du kannst dich nicht selbst herausfordern");
		}

		// The challenger plays for the Corps they are signed in to.
		const myTenantId = tenant.tenantId;
		if (myTenantId === input.opponentTenantId) {
			throw new ValidationError(
				"Mitspieler aus deinem Corps werden über die normale Herausforderung gefordert",
			);
		}

		// Opponent must actually be a member of the chosen tenant.
		const opponentOk = await membershipExists(
			input.opponentId,
			input.opponentTenantId,
		);
		if (!opponentOk) {
			throw new ActionError(
				"Spieler ist kein aktives Mitglied dieses Corps",
				"NOT_A_MEMBER",
			);
		}

		// Both players must have ELO enabled. The preference is per Corps, so
		// each player's is read from their own Corps' DB.
		const [challengerEnabled, opponentEnabled] = await Promise.all([
			readEloEnabled(tenant.db, challengerId),
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
			throw new ConflictError(
				"Es gibt bereits eine offene Herausforderung zwischen euch",
			);
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
		if (!inserted) {
			throw new Error("cross-Corps challenge insert returned no row");
		}
		return { challengeId: inserted.id };
	},
);

// ---------- Respond ----------

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
	async ([input], { user }) => {
		const row = await crossChallenge(input.challengeId);
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
		if (row.respondDeadline.getTime() < Date.now()) {
			await controlDb
				.update(crossTenantChallenges)
				.set({ status: "expired" })
				.where(eq(crossTenantChallenges.id, row.id));
			throw new ConflictError("Herausforderung ist abgelaufen", "EXPIRED");
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
	},
);

// ---------- Cancel ----------

const NOT_CANCELLABLE =
	"Diese Herausforderung kann nicht mehr abgebrochen werden";

export const cancelCrossTenantChallenge = defineAction(
	{ schema: z.tuple([z.string()]), revalidate: CROSS_CHALLENGE_PATHS },
	async ([challengeId], { user }) => {
		const row = await crossChallenge(challengeId);
		if (row.challengerId !== user.id && row.opponentId !== user.id) {
			throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
		}
		if (row.status !== "pending" && row.status !== "accepted") {
			throw new ConflictError(NOT_CANCELLABLE);
		}

		const [cancelled] = await controlDb
			.update(crossTenantChallenges)
			.set({ status: "cancelled" })
			.where(
				and(
					eq(crossTenantChallenges.id, challengeId),
					inArray(crossTenantChallenges.status, ["pending", "accepted"]),
				),
			)
			.returning({ id: crossTenantChallenges.id });
		if (!cancelled) {
			throw new ConflictError(NOT_CANCELLABLE);
		}
	},
);

// ---------- Propose result ----------

export const proposeCrossTenantResult = defineAction(
	{
		schema: z.tuple([
			z.object({ challengeId: z.string(), winnerId: z.string() }),
		]),
		revalidate: CROSS_CHALLENGE_PATHS,
	},
	async ([input], { user }) => {
		const row = await crossChallenge(input.challengeId);
		if (row.challengerId !== user.id && row.opponentId !== user.id) {
			throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
		}
		if (row.status !== "accepted") {
			throw new ConflictError("Spielt erst, dann das Ergebnis melden");
		}
		if (
			input.winnerId !== row.challengerId &&
			input.winnerId !== row.opponentId
		) {
			throw new ValidationError("Ungültiger Gewinner");
		}

		// Only from "accepted": a cancel or the sweep may have closed it
		// meanwhile.
		const [proposed] = await controlDb
			.update(crossTenantChallenges)
			.set({
				status: "result_proposed",
				proposedWinnerId: input.winnerId,
				proposedById: user.id,
				proposedAt: new Date(),
				confirmDeadline: new Date(Date.now() + CONFIRM_WINDOW_MS),
			})
			.where(
				and(
					eq(crossTenantChallenges.id, row.id),
					eq(crossTenantChallenges.status, "accepted"),
				),
			)
			.returning({ id: crossTenantChallenges.id });
		if (!proposed) {
			throw new ConflictError(
				"Ergebnis kann nur in laufenden Spielen gemeldet werden",
			);
		}
	},
);

// ---------- Confirm result ----------

const NO_PROPOSAL = "Es liegt kein Ergebnisvorschlag vor";

export const confirmCrossTenantResult = defineAction(
	{
		schema: z.tuple([z.string()]),
		revalidate: CROSS_CHALLENGE_PATHS,
		errorMessage:
			"Das Ergebnis konnte nicht gebucht werden. Bitte versuche es erneut.",
	},
	async ([challengeId], { user }) => {
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
		if (row.challengerId !== user.id && row.opponentId !== user.id) {
			throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
		}
		if (row.confirmDeadline && row.confirmDeadline.getTime() < Date.now()) {
			await controlDb
				.update(crossTenantChallenges)
				.set({ status: "expired" })
				.where(
					and(
						eq(crossTenantChallenges.id, row.id),
						eq(crossTenantChallenges.status, "result_proposed"),
					),
				);
			throw new ConflictError("Bestätigungsfrist abgelaufen", "EXPIRED");
		}

		return await settleCrossTenantChallenge(challengeId);
	},
);

// ---------- Dispute result ----------

const NO_OPEN_PROPOSAL = "Kein Ergebnisvorschlag offen";

export const disputeCrossTenantResult = defineAction(
	{ schema: z.tuple([z.string()]), revalidate: CROSS_CHALLENGE_PATHS },
	async ([challengeId], { user }) => {
		const row = await crossChallenge(challengeId);
		if (row.status !== "result_proposed") {
			throw new ConflictError(NO_OPEN_PROPOSAL);
		}
		if (row.proposedById === user.id) {
			throw new ActionError(
				"Du hast den Vorschlag selbst gemacht",
				"FORBIDDEN",
			);
		}
		if (row.challengerId !== user.id && row.opponentId !== user.id) {
			throw new ActionError(NOT_A_PLAYER, "FORBIDDEN");
		}

		// Only while still proposed: a confirm may claim it meanwhile.
		const [disputed] = await controlDb
			.update(crossTenantChallenges)
			.set({ status: "disputed" })
			.where(
				and(
					eq(crossTenantChallenges.id, challengeId),
					eq(crossTenantChallenges.status, "result_proposed"),
				),
			)
			.returning({ id: crossTenantChallenges.id });
		if (!disputed) {
			throw new ConflictError(NO_OPEN_PROPOSAL);
		}
	},
);

// ---------- Settle ----------

/** Hands a claimed challenge back so the result can be confirmed again. */
async function releaseCrossClaim(challengeId: string) {
	await controlDb
		.update(crossTenantChallenges)
		.set({ status: "result_proposed" })
		.where(
			and(
				eq(crossTenantChallenges.id, challengeId),
				eq(crossTenantChallenges.status, "confirmed"),
			),
		);
}

/**
 * Books a proposed result: cross-Corps game row and unified ELO. Throws a
 * ConflictError when there is nothing (left) to settle.
 */
async function settleCrossTenantChallenge(
	challengeId: string,
): Promise<{ gameId: string }> {
	// Claim the row atomically: of concurrent confirms exactly one continues.
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
	if (!row) {
		throw new ConflictError(NO_PROPOSAL);
	}
	if (row.proposedWinnerId == null) {
		await releaseCrossClaim(row.id);
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
		await releaseCrossClaim(row.id);
		throw error;
	}

	const challengerIsWinner = row.challengerId === winnerId;
	const gameId = crypto.randomUUID();
	try {
		await controlDb.batch([
			controlDb.insert(crossTenantGames).values({
				id: gameId,
				player1Id: row.challengerId,
				player1TenantId: row.challengerTenantId,
				player2Id: row.opponentId,
				player2TenantId: row.opponentTenantId,
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
			controlDb
				.update(crossTenantChallenges)
				.set({ status: "settled", gameId })
				.where(
					and(
						eq(crossTenantChallenges.id, row.id),
						eq(crossTenantChallenges.status, "confirmed"),
					),
				),
		]);
	} catch (error) {
		// Take the ELO back first; if that fails too, the claim stays so
		// nobody applies it a second time.
		await revertEloOutcome(winnerId, loserId, elo);
		await releaseCrossClaim(row.id);
		throw error;
	}

	// Each player's achievements live in the Corps they played for: two
	// explicit scopes, the challenger's and the opponent's.
	after(() => {
		const challengerCorps = scopeOf(row.challengerTenantId);
		const opponentCorps = scopeOf(row.opponentTenantId);
		const track = async (userId: string, event: AchievementEvent) => {
			try {
				const corps = await (userId === row.challengerId
					? challengerCorps
					: opponentCorps);
				await checkAndUnlockAchievements(corps, userId, event);
			} catch (error) {
				// That Corps' DB is unavailable; tracking never fails the game.
				console.error("Achievement tracking error:", error);
			}
		};
		return Promise.all([
			track(row.challengerId, "game_played"),
			track(row.opponentId, "game_played"),
			track(winnerId, "game_won"),
			track(loserId, "game_lost"),
		]);
	});

	return { gameId };
}

// ---------- Sweep expired ----------

async function sweepExpiredCrossTenantChallenges(): Promise<void> {
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
	if (!session?.user?.id) {
		return empty;
	}
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

	if (rows.length === 0) {
		return empty;
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
				if (role === "challenger") {
					feed.outgoingPending.push(view);
				} else {
					feed.incomingPending.push(view);
				}
				break;
			case "accepted":
				feed.awaitingMyResult.push(view);
				break;
			case "result_proposed":
				if (r.proposedById === userId) {
					feed.active.push(view);
				} else {
					feed.awaitingMyConfirm.push(view);
				}
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
