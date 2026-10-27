// challenge-settlement.ts — books a confirmed in-Corps challenge: game row,
// drink orders and both players' ELO.
//
// Shared by the confirm action (request tenant) and the scheduled sweep
// (every Corps in turn), so the Corps is passed in explicitly instead of
// being read from the request.

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { orderTotal, unitPriceFor } from "~/lib/pricing";
import { checkAndUnlockAchievements } from "~/server/actions/achievements/tracking";
import { challenges, games, orders } from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";
import { getDrinkPricingConfig } from "~/server/lib/getraenke-settings";
import {
	applyEloOutcome,
	type EloOutcome,
	revertEloOutcome,
} from "~/server/lib/user-stats";

/** One Corps: its id and its database. */
export type CorpsScope = { tenantId: string; db: TenantDb };

export type SettleResult = {
	success: boolean;
	error?: string;
	gameId?: string;
};

/**
 * Atomically moves a proposed result into settlement. Of any number of
 * concurrent callers (double-tapped confirm, two overlapping sweeps) exactly
 * one gets the row back; everyone else gets `undefined` and books nothing.
 */
async function claimProposedResult(db: TenantDb, challengeId: string) {
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
async function releaseClaim(db: TenantDb, challengeId: string) {
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
async function planSettlement(scope: CorpsScope, row: ClaimedChallenge) {
	const { db } = scope;
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
		getDrinkPricingConfig(scope),
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

/**
 * Settles a proposed result: claims it, applies the ELO, then books game,
 * orders and the final status in one batch. A challenge that is no longer
 * `result_proposed` (already settled, disputed, claimed by a concurrent
 * caller) is left alone, so calling this twice books nothing twice.
 */
export async function settleChallenge(
	scope: CorpsScope,
	challengeId: string,
): Promise<SettleResult> {
	const { db, tenantId } = scope;
	const row = await claimProposedResult(db, challengeId);
	if (!row) {
		return { success: false, error: "Kein Ergebnis zum Bestätigen" };
	}

	// Until the ELO is applied, giving the claim back undoes everything.
	let plan: Awaited<ReturnType<typeof planSettlement>>;
	let elo: EloOutcome;
	try {
		plan = await planSettlement(scope, row);
		if ("error" in plan) {
			await releaseClaim(db, row.id);
			return { success: false, error: plan.error };
		}
		// Unified userStats (control DB), atomic for both players.
		elo = await applyEloOutcome(plan.winnerId, plan.loserId);
	} catch (error) {
		await releaseClaim(db, row.id);
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
		await releaseClaim(db, row.id);
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
