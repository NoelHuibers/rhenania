import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { checkAndUnlockAchievements } from "~/server/actions/achievements/tracking";
import { auth } from "~/server/auth";
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
	countQueries,
	createDrink,
	createTenant,
	setKasseConfig,
	setupTestDatabases,
	signInAs,
	signOut,
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

// Achievements run after the response; they have their own tests.
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));

// `after()` needs a Next.js request scope; run the task right away instead.
const afterTasks = vi.hoisted(() => [] as unknown[]);
vi.mock("next/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("next/server")>()),
	after: (task: (() => unknown) | Promise<unknown>) => {
		afterTasks.push(typeof task === "function" ? task() : task);
	},
}));

setupTestDatabases();

const START = "2026-10-26T20:00:00Z";

beforeEach(() => {
	freezeClock(START);
	afterTasks.length = 0;
});
afterEach(() => vi.useRealTimers());

async function challengeRow(id: string) {
	const [row] = await tenantDb()
		.select()
		.from(challenges)
		.where(eq(challenges.id, id));
	return row;
}

async function setup(opts: { features?: "drinks.markup"[] } = {}) {
	const tenant = await createTenant({ features: opts.features });
	const [anna, bert] = await createPlayers(2);
	const drink = await createDrink({ name: "Pils", price: 1.5 });
	return { tenant, anna, bert, drink };
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
		const { tenant, anna, bert, drink } = await setup();
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

		// Scheduled with `after()` and bound to this Corps explicitly
		const inCorps = { tenantId: tenant.id };
		expect(afterTasks).toHaveLength(1);
		expect(vi.mocked(checkAndUnlockAchievements).mock.calls).toEqual([
			[anna.id, "game_played", undefined, inCorps],
			[bert.id, "game_played", undefined, inCorps],
			[bert.id, "game_won", undefined, inCorps],
			[anna.id, "game_lost", undefined, inCorps],
		]);
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

	test("a poll with nothing due writes nothing and reads the feed in one query (#21)", async () => {
		const { anna, bert, drink } = await setup();
		const [carl] = await createPlayers(1);
		signInAs(anna);
		await createChallenge({
			opponentId: bert.id,
			drinkId: drink.id,
			payment: "loser",
		});
		await playChallenge({
			challenger: carl,
			opponent: anna,
			drink,
			winner: carl,
		});
		signInAs(anna);
		const session = await countQueries(() => auth());

		const poll = await countQueries(() => getMyChallenges());

		expect(poll.writes).toBe(0);
		// Session lookup, one check for due challenges, one feed query.
		expect(poll.total - session.total).toBe(2);
		expect(poll.result.outgoingPending).toHaveLength(1);
		expect(poll.result.awaitingMyConfirm[0]).toMatchObject({
			challengerName: carl.name,
			opponentName: anna.name,
			drinkName: "Pils",
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
	test("a double-clicked confirm settles exactly once (#16)", async () => {
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
	test("concurrent sweeps auto-settle exactly once (#16)", async () => {
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

	test("the slower of two confirms is told there is nothing left to confirm", async () => {
		const { anna, bert, drink } = await setup();
		const { challengeId } = await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
		});

		const results = await Promise.all([
			confirmResult(challengeId),
			confirmResult(challengeId),
			confirmResult(challengeId),
		]);

		expect(results.filter((r) => r.success)).toHaveLength(1);
		expect(results.filter((r) => !r.success)).toEqual([
			{ success: false, error: "Kein Ergebnis zum Bestätigen" },
			{ success: false, error: "Kein Ergebnis zum Bestätigen" },
		]);
		expect(await getUserStatsRow(bert.id)).toMatchObject({
			totalGames: 1,
			losses: 1,
		});
	});

	test("a confirm racing a cancel either settles or cancels, never both", async () => {
		const { anna, bert, drink } = await setup();
		const { challengeId } = await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
		});

		const [confirmed, cancelled] = await Promise.all([
			confirmResult(challengeId),
			cancelChallenge(challengeId),
		]);

		expect(confirmed.success).not.toBe(cancelled.success);
		const row = await challengeRow(challengeId);
		const booked = await tenantDb().select().from(games);
		if (confirmed.success) {
			expect(row?.status).toBe("settled");
			expect(booked).toHaveLength(1);
		} else {
			expect(row?.status).toBe("cancelled");
			expect(booked).toHaveLength(0);
		}
	});

	test("a confirm racing a dispute either settles or disputes, never both", async () => {
		const { anna, bert, drink } = await setup();
		const { challengeId } = await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
		});

		const [confirmed, disputed] = await Promise.all([
			confirmResult(challengeId),
			disputeResult(challengeId),
		]);

		expect(confirmed.success).not.toBe(disputed.success);
		expect((await challengeRow(challengeId))?.status).toBe(
			confirmed.success ? "settled" : "disputed",
		);
	});

	test("a failed booking takes the ELO back and the result can be confirmed again", async () => {
		const { anna, bert, drink } = await setup();
		await setUserStats(anna.id, { currentElo: 1300, totalGames: 4, wins: 2 });
		const { challengeId } = await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
		});
		const batch = vi
			.spyOn(tenantDb(), "batch")
			.mockRejectedValueOnce(new Error("connection reset"));

		await expect(confirmResult(challengeId)).rejects.toThrow(
			"connection reset",
		);

		expect((await challengeRow(challengeId))?.status).toBe("result_proposed");
		expect(await tenantDb().select().from(games)).toHaveLength(0);
		expect(await tenantDb().select().from(orders)).toHaveLength(0);
		expect(await getUserStatsRow(anna.id)).toMatchObject({
			currentElo: 1300,
			totalGames: 4,
			wins: 2,
		});
		expect(await getUserStatsRow(bert.id)).toMatchObject({
			currentElo: 1200,
			totalGames: 0,
		});
		expect(afterTasks).toHaveLength(0);

		batch.mockRestore();
		expect((await confirmResult(challengeId)).success).toBe(true);
		expect(await tenantDb().select().from(games)).toHaveLength(1);
		expect((await getUserStatsRow(anna.id))?.totalGames).toBe(5);
	});

	test("a failed auto-settle is logged and the feed still loads", async () => {
		const { anna, bert, drink } = await setup();
		const { challengeId } = await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
		});
		advanceClock(11 * MINUTE);
		vi.spyOn(tenantDb(), "batch").mockRejectedValueOnce(new Error("timeout"));
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});

		const feed = await getMyChallenges();

		expect(feed.awaitingMyConfirm.map((c) => c.id)).toEqual([challengeId]);
		expect(logged).toHaveBeenCalledWith(
			expect.stringContaining("challenge auto-settle failed"),
		);
		expect(await getUserStatsRow(anna.id)).toMatchObject({ totalGames: 0 });

		// The next poll settles it.
		await getMyChallenges();
		expect((await challengeRow(challengeId))?.status).toBe("settled");
		logged.mockRestore();
	});
});

describe("guards", () => {
	test("signed-out visitors cannot act on challenges", async () => {
		await setup();
		signOut();
		const notSignedIn = { success: false, error: "Nicht authentifiziert" };

		expect(
			await createChallenge({
				opponentId: "x",
				drinkId: "x",
				payment: "loser",
			}),
		).toEqual(notSignedIn);
		expect(
			await respondToChallenge({ challengeId: "x", response: "accept" }),
		).toEqual(notSignedIn);
		expect(await cancelChallenge("x")).toEqual(notSignedIn);
		expect(await proposeResult({ challengeId: "x", winnerId: "x" })).toEqual(
			notSignedIn,
		);
		expect(await confirmResult("x")).toEqual(notSignedIn);
		expect(await disputeResult("x")).toEqual(notSignedIn);
	});

	test("unknown challenges are reported as not found", async () => {
		const { anna } = await setup();
		signInAs(anna);
		const notFound = {
			success: false,
			error: "Herausforderung nicht gefunden",
		};

		expect(
			await respondToChallenge({ challengeId: "x", response: "accept" }),
		).toEqual(notFound);
		expect(await cancelChallenge("x")).toEqual(notFound);
		expect(await proposeResult({ challengeId: "x", winnerId: "x" })).toEqual(
			notFound,
		);
		expect(await confirmResult("x")).toEqual(notFound);
		expect(await disputeResult("x")).toEqual(notFound);
	});

	test("players outside a challenge cannot touch it", async () => {
		const { anna, bert, drink } = await setup();
		const [carl] = await createPlayers(1);
		const { challengeId } = await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
		});
		signInAs(carl);
		const denied = { success: false, error: "Keine Berechtigung" };

		expect(await cancelChallenge(challengeId)).toEqual(denied);
		expect(await confirmResult(challengeId)).toEqual(denied);
		expect(await disputeResult(challengeId)).toEqual(denied);

		signInAs(bert);
		const open = await createChallenge({
			opponentId: anna.id,
			drinkId: drink.id,
			payment: "split",
		});
		signInAs(anna);
		await respondToChallenge({
			challengeId: open.challengeId as string,
			response: "accept",
		});
		signInAs(carl);
		expect(
			await proposeResult({
				challengeId: open.challengeId as string,
				winnerId: carl.id,
			}),
		).toEqual(denied);
	});

	test("only a proposed result can be disputed; disputes show up as active", async () => {
		const { anna, bert, drink } = await setup();
		signInAs(anna);
		const { challengeId } = await createChallenge({
			opponentId: bert.id,
			drinkId: drink.id,
			payment: "loser",
		});
		signInAs(bert);
		expect(await disputeResult(challengeId as string)).toEqual({
			success: false,
			error: "Nichts anzufechten",
		});

		const played = await playChallenge({
			challenger: bert,
			opponent: anna,
			drink,
			winner: bert,
		});
		signInAs(anna);
		expect((await disputeResult(played.challengeId)).success).toBe(true);

		const feed = await getMyChallenges();
		expect(feed.disputed.map((c) => c.id)).toEqual([played.challengeId]);
		expect(feed.active.map((c) => c.id)).toContain(played.challengeId);
	});

	test("a player without challenges gets an empty feed", async () => {
		const { anna } = await setup();
		signInAs(anna);

		const feed = await getMyChallenges();

		expect(Object.values(feed).every((list) => list.length === 0)).toBe(true);
	});
});
