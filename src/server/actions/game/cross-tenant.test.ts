import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	crossTenantChallenges,
	crossTenantGames,
	tenantMemberships,
} from "~/server/db/control-schema";
import { games } from "~/server/db/schema";
import { sweepCrossCorpsChallenges } from "~/server/lib/challenge-sweep";
import {
	advanceClock,
	freezeClock,
	getUserStatsRow,
	MINUTE,
	playChallenge,
	seedAchievementDefinitions,
	setEloEnabled,
	setUserStats,
	unlockedKeys,
} from "../../../../test/factories/game";
import {
	controlDb,
	countQueries,
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	switchTenant,
	type TestTenant,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";
import {
	cancelCrossTenantChallenge,
	confirmCrossTenantResult,
	createCrossTenantChallenge,
	disputeCrossTenantResult,
	getMyCrossTenantChallenges,
	proposeCrossTenantResult,
	respondToCrossTenantChallenge,
} from "./cross-tenant-challenge";
import {
	getGlobalLeaderboard,
	getGlobalPeakEloHolder,
	listChallengeableTenants,
	listChallengeableUsers,
} from "./cross-tenant-discovery";

// Achievements are stubbed; single tests opt into the real tracking and
// await what the settlement fired in the background.
const tracking = vi.hoisted(() => ({
	real: false,
	pending: [] as Promise<unknown>[],
}));
vi.mock("~/server/actions/achievements/tracking", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("~/server/actions/achievements/tracking")
		>();
	return {
		...actual,
		checkAndUnlockAchievements: vi.fn(
			(...args: Parameters<typeof actual.checkAndUnlockAchievements>) => {
				if (!tracking.real) {
					return Promise.resolve();
				}
				const p = actual.checkAndUnlockAchievements(...args);
				tracking.pending.push(p);
				return p;
			},
		),
	};
});

// `after()` needs a Next.js request scope; run the task right away instead.
vi.mock("next/server", async (importOriginal) => ({
	...(await importOriginal<typeof import("next/server")>()),
	after: (task: (() => unknown) | Promise<unknown>) => {
		if (typeof task === "function") {
			task();
		}
	},
}));

setupTestDatabases();

const START = "2026-10-26T20:00:00Z";

beforeEach(() => {
	freezeClock(START);
	tracking.real = false;
	tracking.pending = [];
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

type Corps = { tenant: TestTenant; player: TestUser };

/** Two Corps with one player each; the request runs on Corps A. */
async function twoCorps(): Promise<{ a: Corps; b: Corps }> {
	const ta = await createTenant({ slug: "rhenania", displayName: "Rhenania" });
	const tb = await createTenant({ slug: "hassia", displayName: "Hassia" });
	const pa = await createUser({ name: "Anton", tenantId: ta.id });
	const pb = await createUser({ name: "Bruno", tenantId: tb.id });
	switchTenant(ta);
	return { a: { tenant: ta, player: pa }, b: { tenant: tb, player: pb } };
}

async function crossRow(id: string) {
	const [row] = await controlDb()
		.select()
		.from(crossTenantChallenges)
		.where(eq(crossTenantChallenges.id, id));
	return row;
}

/**
 * A (challenger) vs B, accepted, `winner` proposed by A (default) or B.
 * Leaves the other player signed in on their own Corps, ready to confirm.
 */
async function proposedCrossChallenge(
	a: Corps,
	b: Corps,
	winner: TestUser,
	proposedBy: "challenger" | "opponent" = "challenger",
) {
	const actAs = (c: Corps) => {
		switchTenant(c.tenant);
		signInAs(c.player);
	};
	actAs(a);
	const created = await createCrossTenantChallenge({
		opponentId: b.player.id,
		opponentTenantId: b.tenant.id,
	});
	const id = created.challengeId as string;
	actAs(b);
	await respondToCrossTenantChallenge({ challengeId: id, response: "accept" });
	const [proposer, confirmer] = proposedBy === "challenger" ? [a, b] : [b, a];
	actAs(proposer);
	await proposeCrossTenantResult({ challengeId: id, winnerId: winner.id });
	actAs(confirmer);
	return id;
}

describe("createCrossTenantChallenge", () => {
	test("opens a pending challenge between members of two Corps", async () => {
		const { a, b } = await twoCorps();
		signInAs(a.player);

		const result = await createCrossTenantChallenge({
			opponentId: b.player.id,
			opponentTenantId: b.tenant.id,
			drinkName: "Pils",
		});

		expect(result.success).toBe(true);
		expect(await crossRow(result.challengeId as string)).toMatchObject({
			challengerId: a.player.id,
			challengerTenantId: a.tenant.id,
			opponentId: b.player.id,
			opponentTenantId: b.tenant.id,
			status: "pending",
			payment: "none",
			drinkName: "Pils",
			quantity: 2,
			respondDeadline: new Date("2026-10-26T20:30:00Z"),
		});
	});

	test("clamps the quantity to 1..100", async () => {
		const { a, b } = await twoCorps();
		const c = await createUser({ tenantId: b.tenant.id });
		signInAs(a.player);

		const low = await createCrossTenantChallenge({
			opponentId: b.player.id,
			opponentTenantId: b.tenant.id,
			quantity: 0,
		});
		const high = await createCrossTenantChallenge({
			opponentId: c.id,
			opponentTenantId: b.tenant.id,
			quantity: 500,
		});

		expect((await crossRow(low.challengeId as string))?.quantity).toBe(1);
		expect((await crossRow(high.challengeId as string))?.quantity).toBe(100);
	});

	test("rejects own-Corps opponents and non-members of the chosen Corps", async () => {
		const { a, b } = await twoCorps();
		const mate = await createUser({ tenantId: a.tenant.id });
		const suspended = await createUser({
			tenantId: b.tenant.id,
			membership: "suspended",
		});
		signInAs(a.player);

		expect(
			await createCrossTenantChallenge({
				opponentId: mate.id,
				opponentTenantId: a.tenant.id,
			}),
		).toMatchObject({
			success: false,
			error: expect.stringMatching(/normale Herausforderung/),
		});
		expect(
			await createCrossTenantChallenge({
				opponentId: suspended.id,
				opponentTenantId: b.tenant.id,
			}),
		).toMatchObject({
			success: false,
			error: "Spieler ist kein aktives Mitglied dieses Corps",
		});
		expect(
			await createCrossTenantChallenge({
				opponentId: a.player.id,
				opponentTenantId: b.tenant.id,
			}),
		).toMatchObject({ success: false, error: expect.stringMatching(/selbst/) });

		expect(await controlDb().select().from(crossTenantChallenges)).toHaveLength(
			0,
		);
	});

	test("rejects a challenger who opted out of the ranking", async () => {
		const { a, b } = await twoCorps();
		await setEloEnabled(a.player.id, false, a.tenant.id);
		signInAs(a.player);

		expect(
			await createCrossTenantChallenge({
				opponentId: b.player.id,
				opponentTenantId: b.tenant.id,
			}),
		).toMatchObject({
			success: false,
			error: "Aktiviere Eloranking in deinen Einstellungen",
		});
	});

	test("respects the opponent's opt-out stored in their own Corps (#16)", async () => {
		const { a, b } = await twoCorps();
		await setEloEnabled(b.player.id, false, b.tenant.id);
		signInAs(a.player);

		const result = await createCrossTenantChallenge({
			opponentId: b.player.id,
			opponentTenantId: b.tenant.id,
		});

		expect(result).toMatchObject({
			success: false,
			error: "Dieser Spieler nimmt nicht am Eloranking teil",
		});
	});

	test("one open challenge between the same two players, in either direction", async () => {
		const { a, b } = await twoCorps();
		signInAs(a.player);
		await createCrossTenantChallenge({
			opponentId: b.player.id,
			opponentTenantId: b.tenant.id,
		});

		switchTenant(b.tenant);
		signInAs(b.player);
		expect(
			await createCrossTenantChallenge({
				opponentId: a.player.id,
				opponentTenantId: a.tenant.id,
			}),
		).toMatchObject({
			success: false,
			error: expect.stringMatching(/bereits eine offene/),
		});

		advanceClock(31 * MINUTE);
		expect(
			(
				await createCrossTenantChallenge({
					opponentId: a.player.id,
					opponentTenantId: a.tenant.id,
				})
			).success,
		).toBe(true);
	});
});

describe("cross-Corps lifecycle", () => {
	test("confirmation writes a cross-Corps game and moves the unified ELO", async () => {
		const { a, b } = await twoCorps();
		await setUserStats(a.player.id, {
			currentElo: 1400,
			totalGames: 5,
			wins: 3,
			losses: 2,
		});
		const id = await proposedCrossChallenge(a, b, a.player);

		const result = await confirmCrossTenantResult(id);

		expect(result).toMatchObject({ success: true, gameId: expect.any(String) });
		const [game] = await controlDb().select().from(crossTenantGames);
		expect(game).toMatchObject({
			id: result.gameId,
			challengeId: id,
			player1Id: a.player.id,
			player1TenantId: a.tenant.id,
			player2Id: b.player.id,
			player2TenantId: b.tenant.id,
			winnerId: a.player.id,
			player1EloBefore: 1400,
			player1EloAfter: 1408,
			player2EloBefore: 1200,
			player2EloAfter: 1192,
		});
		expect(await crossRow(id)).toMatchObject({
			status: "settled",
			gameId: game?.id,
		});
		expect(await getUserStatsRow(a.player.id)).toMatchObject({
			currentElo: 1408,
			totalGames: 6,
			wins: 4,
		});
		// Cross-Corps games never touch the tenant game tables
		expect(await tenantDb(a.tenant.id).select().from(games)).toHaveLength(0);
		expect(await tenantDb(b.tenant.id).select().from(games)).toHaveLength(0);
	});

	test("intra- and cross-Corps games share one ELO", async () => {
		const { a, b } = await twoCorps();
		const mate = await createUser({ tenantId: a.tenant.id });
		const drink = await createDrink({}, a.tenant.id);
		await playChallenge({
			challenger: a.player,
			opponent: mate,
			drink,
			winner: a.player,
			confirm: true,
		});
		expect((await getUserStatsRow(a.player.id))?.currentElo).toBe(1216);

		const id = await proposedCrossChallenge(a, b, b.player);
		await confirmCrossTenantResult(id);

		// 1216 vs 1200: E = 0.523, 32 * -0.523 = -16.7 -> -17
		expect(await getUserStatsRow(a.player.id)).toMatchObject({
			currentElo: 1199,
			peakElo: 1216,
			totalGames: 2,
			wins: 1,
			losses: 1,
		});
		expect((await getUserStatsRow(b.player.id))?.currentElo).toBe(1217);
	});

	test("only the other player may confirm, within 10 minutes", async () => {
		const { a, b } = await twoCorps();
		const id = await proposedCrossChallenge(a, b, a.player);

		switchTenant(a.tenant);
		signInAs(a.player);
		expect((await confirmCrossTenantResult(id)).success).toBe(false);
		expect((await disputeCrossTenantResult(id)).success).toBe(false);

		advanceClock(11 * MINUTE);
		switchTenant(b.tenant);
		signInAs(b.player);
		expect(await confirmCrossTenantResult(id)).toEqual({
			success: false,
			error: "Bestätigungsfrist abgelaufen",
		});
		expect((await crossRow(id))?.status).toBe("expired");
		expect(await controlDb().select().from(crossTenantGames)).toHaveLength(0);
		expect(await getUserStatsRow(a.player.id)).toBeUndefined();
	});

	test("unconfirmed results expire instead of settling", async () => {
		const { a, b } = await twoCorps();
		const id = await proposedCrossChallenge(a, b, a.player);

		advanceClock(11 * MINUTE);
		await sweepCrossCorpsChallenges();

		expect((await crossRow(id))?.status).toBe("expired");
		expect(await controlDb().select().from(crossTenantGames)).toHaveLength(0);
	});

	test("the feed writes nothing and shows overdue challenges as expired (#21)", async () => {
		const { a, b } = await twoCorps();
		const id = await proposedCrossChallenge(a, b, a.player);
		advanceClock(11 * MINUTE);

		const read = await countQueries(() => getMyCrossTenantChallenges());

		expect(read.writes).toBe(0);
		expect(read.result.awaitingMyConfirm).toEqual([]);
		expect(read.result.history).toEqual([
			expect.objectContaining({ id, status: "expired" }),
		]);
		expect((await crossRow(id))?.status).toBe("result_proposed");
	});

	test("decline, dispute and cancel rules", async () => {
		const { a, b } = await twoCorps();
		signInAs(a.player);
		const declined = await createCrossTenantChallenge({
			opponentId: b.player.id,
			opponentTenantId: b.tenant.id,
		});
		switchTenant(b.tenant);
		signInAs(b.player);
		expect(
			await respondToCrossTenantChallenge({
				challengeId: declined.challengeId as string,
				response: "decline",
			}),
		).toEqual({ success: true });
		expect(await crossRow(declined.challengeId as string)).toMatchObject({
			status: "declined",
			declinedAt: new Date(START),
		});

		const disputed = await proposedCrossChallenge(a, b, a.player);
		expect(await cancelCrossTenantChallenge(disputed)).toMatchObject({
			success: false,
		});
		expect(await disputeCrossTenantResult(disputed)).toEqual({ success: true });
		expect((await crossRow(disputed))?.status).toBe("disputed");

		switchTenant(a.tenant);
		signInAs(a.player);
		advanceClock(MINUTE);
		const cancelled = await createCrossTenantChallenge({
			opponentId: b.player.id,
			opponentTenantId: b.tenant.id,
		});
		expect(
			await cancelCrossTenantChallenge(cancelled.challengeId as string),
		).toEqual({
			success: true,
		});
		expect((await crossRow(cancelled.challengeId as string))?.status).toBe(
			"cancelled",
		);
	});

	test("once a result is proposed, neither player can cancel (#142)", async () => {
		const { a, b } = await twoCorps();
		const id = await proposedCrossChallenge(a, b, a.player);

		// B, the reported loser, is signed in.
		expect(await cancelCrossTenantChallenge(id)).toMatchObject({
			success: false,
		});
		switchTenant(a.tenant);
		signInAs(a.player);
		expect(await cancelCrossTenantChallenge(id)).toMatchObject({
			success: false,
		});
		expect((await crossRow(id))?.status).toBe("result_proposed");
	});

	test("a proposal racing a cancel either proposes or cancels, never both (#142)", async () => {
		const { a, b } = await twoCorps();
		signInAs(a.player);
		const created = await createCrossTenantChallenge({
			opponentId: b.player.id,
			opponentTenantId: b.tenant.id,
		});
		const id = created.challengeId as string;
		switchTenant(b.tenant);
		signInAs(b.player);
		await respondToCrossTenantChallenge({
			challengeId: id,
			response: "accept",
		});

		const [cancelled, proposed] = await Promise.all([
			cancelCrossTenantChallenge(id),
			proposeCrossTenantResult({ challengeId: id, winnerId: a.player.id }),
		]);

		expect(proposed.success).not.toBe(cancelled.success);
		expect((await crossRow(id))?.status).toBe(
			proposed.success ? "result_proposed" : "cancelled",
		);
	});

	test("a late reply expires the challenge", async () => {
		const { a, b } = await twoCorps();
		signInAs(a.player);
		const { challengeId } = await createCrossTenantChallenge({
			opponentId: b.player.id,
			opponentTenantId: b.tenant.id,
		});

		advanceClock(31 * MINUTE);
		switchTenant(b.tenant);
		signInAs(b.player);

		expect(
			await respondToCrossTenantChallenge({
				challengeId: challengeId as string,
				response: "accept",
			}),
		).toEqual({ success: false, error: "Herausforderung ist abgelaufen" });
		expect(
			await proposeCrossTenantResult({
				challengeId: challengeId as string,
				winnerId: b.player.id,
			}),
		).toMatchObject({ success: false });
	});

	test("the feed shows both Corps and sorts by the caller's role", async () => {
		const { a, b } = await twoCorps();
		const id = await proposedCrossChallenge(a, b, a.player);

		const opponentFeed = await getMyCrossTenantChallenges();
		expect(opponentFeed.awaitingMyConfirm).toHaveLength(1);
		expect(opponentFeed.awaitingMyConfirm[0]).toMatchObject({
			id,
			role: "opponent",
			challengerName: "Anton",
			challengerTenantSlug: "rhenania",
			challengerTenantName: "Rhenania",
			opponentName: "Bruno",
			opponentTenantSlug: "hassia",
			opponentTenantName: "Hassia",
			proposedWinnerId: a.player.id,
		});

		switchTenant(a.tenant);
		signInAs(a.player);
		const challengerFeed = await getMyCrossTenantChallenges();
		expect(challengerFeed.active.map((c) => c.id)).toEqual([id]);
		expect(challengerFeed.awaitingMyConfirm).toHaveLength(0);
	});

	test("unlocks the challenger's date achievement in their own Corps", async () => {
		freezeClock("2026-10-03T15:00:00Z");
		const { a, b } = await twoCorps();
		await seedAchievementDefinitions(a.tenant.id);
		await seedAchievementDefinitions(b.tenant.id);
		// Bruno reports, Anton confirms from his own subdomain.
		const id = await proposedCrossChallenge(a, b, a.player, "opponent");
		vi.spyOn(console, "error").mockImplementation(() => {});
		tracking.real = true;

		await confirmCrossTenantResult(id);
		await Promise.all(tracking.pending);

		expect(await unlockedKeys(a.player.id, a.tenant.id)).toEqual([
			"deutschland",
			"erstersieg",
			"tierlunge",
		]);
	});

	test("a cross-Corps win counts towards game achievements (#141)", async () => {
		const { a, b } = await twoCorps();
		await seedAchievementDefinitions(a.tenant.id);
		const id = await proposedCrossChallenge(a, b, a.player, "opponent");
		vi.spyOn(console, "error").mockImplementation(() => {});
		tracking.real = true;

		await confirmCrossTenantResult(id);
		await Promise.all(tracking.pending);

		expect(await unlockedKeys(a.player.id, a.tenant.id)).toEqual([
			"erstersieg",
			"tierlunge",
		]);
	});

	test("unlocks each player's achievement in their own Corps (#16)", async () => {
		freezeClock("2026-10-03T15:00:00Z");
		const { a, b } = await twoCorps();
		await seedAchievementDefinitions(a.tenant.id);
		await seedAchievementDefinitions(b.tenant.id);
		// Anton reports, Bruno confirms from his own subdomain.
		const id = await proposedCrossChallenge(a, b, b.player);
		vi.spyOn(console, "error").mockImplementation(() => {});
		tracking.real = true;

		await confirmCrossTenantResult(id);
		await Promise.all(tracking.pending);

		expect(await unlockedKeys(a.player.id, a.tenant.id)).toContain(
			"deutschland",
		);
		expect(await unlockedKeys(b.player.id, b.tenant.id)).toContain(
			"deutschland",
		);
	});

	test("a double-clicked confirm settles exactly once (#16)", async () => {
		const { a, b } = await twoCorps();
		const id = await proposedCrossChallenge(a, b, a.player);

		await Promise.all([
			confirmCrossTenantResult(id),
			confirmCrossTenantResult(id),
		]);

		expect(await controlDb().select().from(crossTenantGames)).toHaveLength(1);
		expect((await getUserStatsRow(a.player.id))?.totalGames).toBe(1);
	});

	test("the slower confirm is told there is no proposal left", async () => {
		const { a, b } = await twoCorps();
		const id = await proposedCrossChallenge(a, b, a.player);

		const results = await Promise.all([
			confirmCrossTenantResult(id),
			confirmCrossTenantResult(id),
		]);

		expect(results.filter((r) => r.success)).toHaveLength(1);
		expect(results.find((r) => !r.success)).toEqual({
			success: false,
			error: "Es liegt kein Ergebnisvorschlag vor",
		});
	});

	test("a confirm racing a dispute either settles or disputes, never both", async () => {
		const { a, b } = await twoCorps();
		const id = await proposedCrossChallenge(a, b, a.player);

		const [confirmed, disputed] = await Promise.all([
			confirmCrossTenantResult(id),
			disputeCrossTenantResult(id),
		]);

		expect(confirmed.success).not.toBe(disputed.success);
		expect((await crossRow(id))?.status).toBe(
			confirmed.success ? "settled" : "disputed",
		);
		expect(await controlDb().select().from(crossTenantGames)).toHaveLength(
			confirmed.success ? 1 : 0,
		);
	});

	test("a failed booking takes the ELO back and the result can be confirmed again", async () => {
		const { a, b } = await twoCorps();
		await setUserStats(a.player.id, { currentElo: 1400, totalGames: 5 });
		const id = await proposedCrossChallenge(a, b, a.player);
		const batch = vi
			.spyOn(controlDb(), "batch")
			.mockRejectedValueOnce(new Error("connection reset"));

		await expect(confirmCrossTenantResult(id)).rejects.toThrow(
			"connection reset",
		);

		expect((await crossRow(id))?.status).toBe("result_proposed");
		expect(await controlDb().select().from(crossTenantGames)).toHaveLength(0);
		expect(await getUserStatsRow(a.player.id)).toMatchObject({
			currentElo: 1400,
			totalGames: 5,
			wins: 0,
		});
		expect(await getUserStatsRow(b.player.id)).toMatchObject({
			currentElo: 1200,
			totalGames: 0,
			losses: 0,
		});

		batch.mockRestore();
		expect((await confirmCrossTenantResult(id)).success).toBe(true);
		expect((await getUserStatsRow(a.player.id))?.totalGames).toBe(6);
	});
});

describe("cross-Corps discovery", () => {
	test("lists the other active Corps with their active member counts", async () => {
		const { a, b } = await twoCorps();
		await createUser({ tenantId: b.tenant.id });
		await createUser({ tenantId: b.tenant.id, membership: "suspended" });
		const c = await createTenant({ displayName: "Alemannia" });
		await createTenant({ displayName: "Zollern", status: "suspended" });
		switchTenant(a.tenant);
		signInAs(a.player);

		const list = await listChallengeableTenants();

		expect(list).toEqual([
			{ id: c.id, slug: c.slug, displayName: "Alemannia", memberCount: 0 },
			{
				id: b.tenant.id,
				slug: "hassia",
				displayName: "Hassia",
				memberCount: 2,
			},
		]);
	});

	test("lists a Corps' active members by ELO, new players at 1200", async () => {
		const { a, b } = await twoCorps();
		const strong = await createUser({ name: "Stark", tenantId: b.tenant.id });
		await createUser({ tenantId: b.tenant.id, membership: "suspended" });
		await setUserStats(strong.id, { currentElo: 1350, totalGames: 7 });
		signInAs(a.player);

		const members = await listChallengeableUsers(b.tenant.id);

		expect(
			members.map(({ userId, name, currentElo, totalGames }) => ({
				userId,
				name,
				currentElo,
				totalGames,
			})),
		).toEqual([
			{ userId: strong.id, name: "Stark", currentElo: 1350, totalGames: 7 },
			{ userId: b.player.id, name: "Bruno", currentElo: 1200, totalGames: 0 },
		]);
	});

	test("excludes the caller when they are also a member of that Corps", async () => {
		const { a, b } = await twoCorps();
		await controlDb()
			.insert(tenantMemberships)
			.values({ userId: a.player.id, tenantId: b.tenant.id, status: "active" });
		signInAs(a.player);

		const members = await listChallengeableUsers(b.tenant.id);

		expect(members.map((m) => m.userId)).toEqual([b.player.id]);
	});

	test("global leaderboard ranks every Corps by unified ELO", async () => {
		const { a, b } = await twoCorps();
		const idle = await createUser({ tenantId: b.tenant.id });
		await setUserStats(a.player.id, {
			currentElo: 1250,
			totalGames: 4,
			wins: 3,
			losses: 1,
		});
		await setUserStats(b.player.id, {
			currentElo: 1300,
			peakElo: 1340,
			totalGames: 2,
			wins: 1,
			losses: 1,
		});
		await setUserStats(idle.id, { currentElo: 1500, totalGames: 0 });
		signInAs(a.player);

		const board = await getGlobalLeaderboard();

		expect(board.map((e) => [e.name, e.tenantSlug, e.currentElo])).toEqual([
			["Bruno", "hassia", 1300],
			["Anton", "rhenania", 1250],
		]);
		expect(board[1]).toMatchObject({ tenantName: "Rhenania", winRate: 75 });
		expect((await getGlobalLeaderboard(1, 1)).map((e) => e.name)).toEqual([
			"Anton",
		]);
	});

	test("global peak holder is the highest peak among active players", async () => {
		const { a, b } = await twoCorps();
		expect(await getGlobalPeakEloHolder()).toBeNull();

		await setUserStats(a.player.id, {
			currentElo: 1250,
			peakElo: 1450,
			totalGames: 9,
		});
		await setUserStats(b.player.id, {
			currentElo: 1400,
			peakElo: 1410,
			totalGames: 9,
		});

		expect(await getGlobalPeakEloHolder()).toEqual({
			name: "Anton",
			peakElo: 1450,
			tenantSlug: "rhenania",
			tenantName: "Rhenania",
		});
	});
});
