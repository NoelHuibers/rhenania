import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { checkAndUnlockAchievements } from "~/server/actions/achievements/tracking";
import { challenges, games, orders } from "~/server/db/schema";
import {
	advanceClock,
	createPlayers,
	freezeClock,
	getUserStatsRow,
	HOUR,
	MINUTE,
	playChallenge,
	setEloEnabled,
	setUserStats,
} from "../../../../test/factories/game";
import {
	createDrink,
	createTenant,
	setKasseConfig,
	setupTestDatabases,
	signInAs,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";
import {
	cancelChallenge,
	confirmResult,
	createChallenge,
	disputeResult,
	getMyChallenges,
	proposeResult,
	respondToChallenge,
} from "./challenge";

// Achievements run fire-and-forget after the response; they have their own tests.
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));

setupTestDatabases();

const START = "2026-10-26T20:00:00Z";

beforeEach(() => freezeClock(START));
afterEach(() => vi.useRealTimers());

async function challengeRow(id: string) {
	const [row] = await tenantDb()
		.select()
		.from(challenges)
		.where(eq(challenges.id, id));
	return row;
}

async function setup(opts: { features?: "drinks.markup"[] } = {}) {
	await createTenant({ features: opts.features });
	const [anna, bert] = await createPlayers(2);
	const drink = await createDrink({ name: "Pils", price: 1.5 });
	return { anna, bert, drink };
}

describe("createChallenge", () => {
	test("opens a pending challenge for two drinks with a 30 min reply window", async () => {
		const { anna, bert, drink } = await setup();
		signInAs(anna);

		const result = await createChallenge({
			opponentId: bert.id,
			drinkId: drink.id,
			payment: "loser",
		});

		expect(result.success).toBe(true);
		expect(await challengeRow(result.challengeId as string)).toMatchObject({
			challengerId: anna.id,
			opponentId: bert.id,
			drinkId: drink.id,
			payment: "loser",
			quantity: 2,
			status: "pending",
			createdAt: new Date(START),
			respondDeadline: new Date("2026-10-26T20:30:00Z"),
		});
	});

	test("rejects self-challenges, opted-out players and unavailable drinks", async () => {
		const { anna, bert, drink } = await setup();
		const empty = await createDrink({ available: false });
		signInAs(anna);
		const input = {
			opponentId: bert.id,
			drinkId: drink.id,
			payment: "loser",
		} as const;

		expect(
			await createChallenge({ ...input, opponentId: anna.id }),
		).toMatchObject({ success: false, error: expect.stringMatching(/selbst/) });
		expect(
			await createChallenge({ ...input, drinkId: "missing" }),
		).toMatchObject({ success: false, error: "Getränk nicht gefunden" });
		expect(
			await createChallenge({ ...input, drinkId: empty.id }),
		).toMatchObject({ success: false, error: "Getränk ist nicht verfügbar" });

		await setEloEnabled(bert.id, false);
		expect(await createChallenge(input)).toMatchObject({
			success: false,
			error: "Dieser Spieler nimmt nicht am Eloranking teil",
		});
		await setEloEnabled(bert.id, true);
		await setEloEnabled(anna.id, false);
		expect(await createChallenge(input)).toMatchObject({
			success: false,
			error: "Aktiviere Eloranking in deinen Einstellungen",
		});

		expect(await tenantDb().select().from(challenges)).toHaveLength(0);
	});

	test("allows one open challenge per direction", async () => {
		const { anna, bert, drink } = await setup();
		const input = { drinkId: drink.id, payment: "split" } as const;

		signInAs(anna);
		expect(
			(await createChallenge({ ...input, opponentId: bert.id })).success,
		).toBe(true);
		expect(
			await createChallenge({ ...input, opponentId: bert.id }),
		).toMatchObject({
			success: false,
			error: expect.stringMatching(/bereits eine offene/),
		});

		signInAs(bert);
		expect(
			(await createChallenge({ ...input, opponentId: anna.id })).success,
		).toBe(true);
	});

	test("an expired challenge no longer blocks a new one", async () => {
		const { anna, bert, drink } = await setup();
		const input = {
			opponentId: bert.id,
			drinkId: drink.id,
			payment: "loser",
		} as const;
		signInAs(anna);
		const first = await createChallenge(input);

		advanceClock(31 * MINUTE);
		const second = await createChallenge(input);

		expect(second.success).toBe(true);
		expect((await challengeRow(first.challengeId as string))?.status).toBe(
			"expired",
		);
	});

	test("after a decline the challenger has to wait an hour", async () => {
		const { anna, bert, drink } = await setup();
		const input = {
			opponentId: bert.id,
			drinkId: drink.id,
			payment: "loser",
		} as const;
		signInAs(anna);
		const { challengeId } = await createChallenge(input);
		signInAs(bert);
		await respondToChallenge({
			challengeId: challengeId as string,
			response: "decline",
		});

		signInAs(anna);
		advanceClock(59 * MINUTE);
		expect(await createChallenge(input)).toMatchObject({
			success: false,
			error: expect.stringMatching(/warte eine Stunde/),
		});

		advanceClock(2 * MINUTE);
		expect((await createChallenge(input)).success).toBe(true);
	});
});

describe("respond, propose, confirm", () => {
	test("accepting starts a 6 h play window", async () => {
		const { anna, bert, drink } = await setup();
		signInAs(anna);
		const { challengeId } = await createChallenge({
			opponentId: bert.id,
			drinkId: drink.id,
			payment: "loser",
		});
		const id = challengeId as string;

		signInAs(anna);
		expect(
			await respondToChallenge({ challengeId: id, response: "accept" }),
		).toMatchObject({
			success: false,
			error: "Nur der Herausgeforderte kann antworten",
		});

		advanceClock(10 * MINUTE);
		signInAs(bert);
		expect(
			await respondToChallenge({ challengeId: id, response: "accept" }),
		).toEqual({
			success: true,
		});
		expect(await challengeRow(id)).toMatchObject({
			status: "accepted",
			acceptedAt: new Date("2026-10-26T20:10:00Z"),
			playDeadline: new Date("2026-10-27T02:10:00Z"),
		});
		expect(
			(await respondToChallenge({ challengeId: id, response: "decline" }))
				.success,
		).toBe(false);
	});

	test("a late reply expires the challenge", async () => {
		const { anna, bert, drink } = await setup();
		signInAs(anna);
		const { challengeId } = await createChallenge({
			opponentId: bert.id,
			drinkId: drink.id,
			payment: "loser",
		});

		advanceClock(31 * MINUTE);
		signInAs(bert);
		const result = await respondToChallenge({
			challengeId: challengeId as string,
			response: "accept",
		});

		expect(result).toEqual({
			success: false,
			error: "Herausforderung ist abgelaufen",
		});
		expect((await challengeRow(challengeId as string))?.status).toBe("expired");
	});

	test("a result can only be proposed for an accepted game with a valid winner", async () => {
		const { anna, bert, drink } = await setup();
		const [carl] = await createPlayers(1);
		signInAs(anna);
		const { challengeId } = await createChallenge({
			opponentId: bert.id,
			drinkId: drink.id,
			payment: "loser",
		});
		const id = challengeId as string;

		expect(
			await proposeResult({ challengeId: id, winnerId: anna.id }),
		).toMatchObject({
			success: false,
			error: expect.stringMatching(/laufenden Spielen/),
		});

		signInAs(bert);
		await respondToChallenge({ challengeId: id, response: "accept" });
		expect(await proposeResult({ challengeId: id, winnerId: carl.id })).toEqual(
			{ success: false, error: "Ungültiger Gewinner" },
		);

		advanceClock(MINUTE);
		expect(await proposeResult({ challengeId: id, winnerId: bert.id })).toEqual(
			{
				success: true,
			},
		);
		expect(await challengeRow(id)).toMatchObject({
			status: "result_proposed",
			proposedWinnerId: bert.id,
			proposedById: bert.id,
			confirmDeadline: new Date("2026-10-26T20:11:00Z"),
		});
	});

	test("the proposer cannot confirm or dispute their own result", async () => {
		const { anna, bert, drink } = await setup();
		const { challengeId } = await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
		});

		signInAs(anna);
		expect((await confirmResult(challengeId)).success).toBe(false);
		expect((await disputeResult(challengeId)).success).toBe(false);
		expect((await challengeRow(challengeId))?.status).toBe("result_proposed");
		expect(await tenantDb().select().from(games)).toHaveLength(0);
	});

	test("confirmation settles: game row, unified ELO, loser pays two drinks", async () => {
		const { anna, bert, drink } = await setup();
		await setUserStats(anna.id, {
			currentElo: 1400,
			totalGames: 12,
			wins: 8,
			losses: 4,
		});

		const { challengeId } = await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: bert,
			payment: "loser",
		});
		const result = await confirmResult(challengeId);

		expect(result).toMatchObject({ success: true, gameId: expect.any(String) });
		const [game] = await tenantDb().select().from(games);
		expect(game).toMatchObject({
			id: result.gameId,
			challengeId,
			player1Id: anna.id,
			player2Id: bert.id,
			winnerId: bert.id,
			player1EloBefore: 1400,
			player1EloAfter: 1376,
			player2EloBefore: 1200,
			player2EloAfter: 1224,
		});
		expect(await challengeRow(challengeId)).toMatchObject({
			status: "settled",
			gameId: result.gameId,
		});
		expect(await getUserStatsRow(anna.id)).toMatchObject({
			currentElo: 1376,
			totalGames: 13,
			losses: 5,
		});
		expect(await getUserStatsRow(bert.id)).toMatchObject({
			currentElo: 1224,
			wins: 1,
		});

		const booked = await tenantDb().select().from(orders);
		expect(booked).toEqual([
			expect.objectContaining({
				userId: anna.id,
				userName: anna.name,
				drinkId: drink.id,
				drinkName: "Pils",
				amount: 2,
				pricePerUnit: 1.5,
				total: 3,
				costPerUnit: null,
				bookingFor: null,
			}),
		]);

		expect(vi.mocked(checkAndUnlockAchievements).mock.calls).toEqual(
			expect.arrayContaining([
				[anna.id, "game_played"],
				[bert.id, "game_played"],
				[bert.id, "game_won"],
				[anna.id, "game_lost"],
			]),
		);
	});

	test.each([
		{
			payment: "challenger" as const,
			winner: "challenger",
			challengerPays: 2,
			opponentPays: 0,
		},
		{
			payment: "challenger" as const,
			winner: "opponent",
			challengerPays: 2,
			opponentPays: 0,
		},
		{
			payment: "loser" as const,
			winner: "challenger",
			challengerPays: 0,
			opponentPays: 2,
		},
		{
			payment: "split" as const,
			winner: "challenger",
			challengerPays: 1,
			opponentPays: 1,
		},
		{
			payment: "split" as const,
			winner: "opponent",
			challengerPays: 1,
			opponentPays: 1,
		},
	])("payment $payment, $winner wins: challenger pays $challengerPays, opponent $opponentPays", async ({
		payment,
		winner,
		challengerPays,
		opponentPays,
	}) => {
		const { anna, bert, drink } = await setup();

		await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: winner === "challenger" ? anna : bert,
			payment,
			confirm: true,
		});

		const booked = await tenantDb().select().from(orders);
		const paid = (u: TestUser) =>
			booked.filter((o) => o.userId === u.id).reduce((s, o) => s + o.amount, 0);
		expect(paid(anna)).toBe(challengerPays);
		expect(paid(bert)).toBe(opponentPays);
		expect(booked.every((o) => o.amount > 0)).toBe(true);
	});

	test("challenge drinks are personal orders and carry the tenant markup", async () => {
		const { anna, bert, drink } = await setup({ features: ["drinks.markup"] });
		await setKasseConfig({ markupPercent: 10 });

		await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
			payment: "loser",
			confirm: true,
		});

		const [order] = await tenantDb().select().from(orders);
		expect(order).toMatchObject({
			userId: bert.id,
			amount: 2,
			pricePerUnit: 1.65,
			costPerUnit: 1.5,
			total: 3.3,
		});
	});

	test("disputing parks the challenge without a game or orders", async () => {
		const { anna, bert, drink } = await setup();
		const { challengeId } = await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
		});

		expect(await disputeResult(challengeId)).toEqual({ success: true });

		expect((await challengeRow(challengeId))?.status).toBe("disputed");
		expect((await confirmResult(challengeId)).success).toBe(false);
		expect(await tenantDb().select().from(games)).toHaveLength(0);
		expect(await tenantDb().select().from(orders)).toHaveLength(0);
	});

	test("either player can cancel an open challenge, but not a settled one", async () => {
		const { anna, bert, drink } = await setup();
		signInAs(anna);
		const { challengeId } = await createChallenge({
			opponentId: bert.id,
			drinkId: drink.id,
			payment: "loser",
		});
		signInAs(bert);
		expect(await cancelChallenge(challengeId as string)).toEqual({
			success: true,
		});
		expect((await challengeRow(challengeId as string))?.status).toBe(
			"cancelled",
		);

		const settled = await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
			confirm: true,
		});
		signInAs(anna);
		expect(await cancelChallenge(settled.challengeId)).toEqual({
			success: false,
			error: "Kann nicht mehr abgebrochen werden",
		});
	});
});

describe("sweepExpiredChallenges (via getMyChallenges)", () => {
	test("expires unanswered and unplayed challenges", async () => {
		const { anna, bert, drink } = await setup();
		const [carl] = await createPlayers(1);
		signInAs(anna);
		const unanswered = await createChallenge({
			opponentId: bert.id,
			drinkId: drink.id,
			payment: "loser",
		});
		const unplayed = await createChallenge({
			opponentId: carl.id,
			drinkId: drink.id,
			payment: "loser",
		});
		signInAs(carl);
		await respondToChallenge({
			challengeId: unplayed.challengeId as string,
			response: "accept",
		});

		advanceClock(HOUR);
		await getMyChallenges();
		expect((await challengeRow(unanswered.challengeId as string))?.status).toBe(
			"expired",
		);
		expect((await challengeRow(unplayed.challengeId as string))?.status).toBe(
			"accepted",
		);

		advanceClock(5 * HOUR + MINUTE);
		await getMyChallenges();
		expect((await challengeRow(unplayed.challengeId as string))?.status).toBe(
			"expired",
		);
	});

	test("auto-settles a proposed result once the 10 min confirm window has passed", async () => {
		const { anna, bert, drink } = await setup();
		const { challengeId } = await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
			payment: "loser",
		});

		advanceClock(9 * MINUTE);
		await getMyChallenges();
		expect((await challengeRow(challengeId))?.status).toBe("result_proposed");

		advanceClock(2 * MINUTE);
		const feed = await getMyChallenges();

		const row = await challengeRow(challengeId);
		expect(row?.status).toBe("settled");
		const [game] = await tenantDb().select().from(games);
		expect(game).toMatchObject({ id: row?.gameId, winnerId: anna.id });
		const booked = await tenantDb().select().from(orders);
		expect(booked).toEqual([
			expect.objectContaining({ userId: bert.id, amount: 2 }),
		]);
		expect(feed.history.map((c) => c.id)).toEqual([challengeId]);
		expect(feed.history[0]).toMatchObject({
			status: "settled",
			gameId: game?.id,
		});
	});
});

describe("getMyChallenges", () => {
	test("sorts each challenge into the caller's buckets", async () => {
		const { anna, bert, drink } = await setup();
		const [carl, dora, emil] = await createPlayers(3);
		const input = { drinkId: drink.id, payment: "loser" } as const;

		signInAs(anna);
		const outgoing = await createChallenge({ ...input, opponentId: bert.id });
		signInAs(carl);
		const incoming = await createChallenge({ ...input, opponentId: anna.id });
		advanceClock(MINUTE);
		const toConfirm = await playChallenge({
			challenger: dora,
			opponent: anna,
			drink,
			winner: dora,
		});
		advanceClock(MINUTE);
		const mineProposed = await playChallenge({
			challenger: anna,
			opponent: emil,
			drink,
			winner: anna,
		});

		signInAs(anna);
		const feed = await getMyChallenges();

		expect(feed.outgoingPending.map((c) => c.id)).toEqual([
			outgoing.challengeId,
		]);
		expect(feed.incomingPending.map((c) => c.id)).toEqual([
			incoming.challengeId,
		]);
		expect(feed.awaitingMyConfirm.map((c) => c.id)).toEqual([
			toConfirm.challengeId,
		]);
		expect(feed.active.map((c) => c.id)).toEqual([
			mineProposed.challengeId,
			toConfirm.challengeId,
		]);
		expect(feed.incomingPending[0]).toMatchObject({
			role: "opponent",
			challengerName: carl.name,
			opponentName: anna.name,
			drinkName: "Pils",
			drinkPrice: 1.5,
		});
	});

	test("is empty for signed-out visitors", async () => {
		await setup();
		expect(await getMyChallenges()).toEqual({
			incomingPending: [],
			outgoingPending: [],
			active: [],
			awaitingMyResult: [],
			awaitingMyConfirm: [],
			disputed: [],
			history: [],
		});
	});
});

describe("settlement races", () => {
	// Status is checked before settling but not claimed atomically.
	test.fails("a double-clicked confirm settles exactly once (#16)", async () => {
		const { anna, bert, drink } = await setup();
		const { challengeId } = await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
			payment: "loser",
		});

		await Promise.all([confirmResult(challengeId), confirmResult(challengeId)]);

		expect(await tenantDb().select().from(games)).toHaveLength(1);
		expect(await tenantDb().select().from(orders)).toHaveLength(1);
	});

	// Two page loads after the confirm deadline both run the auto-settle sweep.
	test.fails("concurrent sweeps auto-settle exactly once (#16)", async () => {
		const { anna, bert, drink } = await setup();
		await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
			payment: "loser",
		});
		advanceClock(11 * MINUTE);

		await Promise.all([getMyChallenges(), getMyChallenges()]);

		expect(await tenantDb().select().from(games)).toHaveLength(1);
		expect((await getUserStatsRow(anna.id))?.totalGames).toBe(1);
	});
});
