import { afterEach, describe, expect, test, vi } from "vitest";

import { checkAndUnlockAchievements } from "~/server/actions/achievements/tracking";
import { games } from "~/server/db/schema";
import {
	createPlayers,
	freezeClock,
	getUserStatsRow,
	insertGame,
	MINUTE,
	setEloEnabled,
	setUserStats,
} from "../../../../test/factories/game";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	createGame,
	getLeaderboard,
	getRecentGames,
	getUserEloHistory,
	getUserGames,
	getUserStats,
} from "./game";
import { getAllUsersExcept } from "./getUsers";

// Achievements run fire-and-forget after the response; they have their own tests.
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));

setupTestDatabases();
afterEach(() => vi.useRealTimers());

describe("createGame", () => {
	test("records a win with ELO before/after on both sides", async () => {
		await createTenant();
		const [me, rival] = await createPlayers(2);
		signInAs(me);

		const result = await createGame({ player2Id: rival.id, won: true });

		expect(result).toMatchObject({ success: true, eloChange: 16 });
		const [game] = await tenantDb().select().from(games);
		expect(game).toMatchObject({
			id: result.gameId,
			player1Id: me.id,
			player2Id: rival.id,
			winnerId: me.id,
			player1EloBefore: 1200,
			player1EloAfter: 1216,
			player2EloBefore: 1200,
			player2EloAfter: 1184,
		});
		expect(await getUserStatsRow(me.id)).toMatchObject({
			currentElo: 1216,
			wins: 1,
		});
		expect(await getUserStatsRow(rival.id)).toMatchObject({
			currentElo: 1184,
			losses: 1,
		});
	});

	test("a reported loss credits the opponent, from current ratings", async () => {
		await createTenant();
		const [me, rival] = await createPlayers(2);
		await setUserStats(me.id, { currentElo: 1400 });
		signInAs(me);

		const result = await createGame({ player2Id: rival.id, won: false });

		expect(result).toMatchObject({ success: true, eloChange: 24 });
		const [game] = await tenantDb().select().from(games);
		expect(game).toMatchObject({
			winnerId: rival.id,
			player1EloBefore: 1400,
			player1EloAfter: 1376,
			player2EloBefore: 1200,
			player2EloAfter: 1224,
		});
	});

	test("fires game achievements for both players", async () => {
		await createTenant();
		const [me, rival] = await createPlayers(2);
		signInAs(me);

		await createGame({ player2Id: rival.id, won: true });

		const calls = vi.mocked(checkAndUnlockAchievements).mock.calls;
		expect(calls).toEqual(
			expect.arrayContaining([
				[me.id, "game_played"],
				[rival.id, "game_played"],
				[me.id, "game_won"],
				[rival.id, "game_lost"],
			]),
		);
	});

	test("rejects self-play and opted-out players without writing", async () => {
		await createTenant();
		const [me, rival] = await createPlayers(2);
		signInAs(me);

		expect(await createGame({ player2Id: me.id, won: true })).toMatchObject({
			success: false,
		});

		await setEloEnabled(rival.id, false);
		expect(await createGame({ player2Id: rival.id, won: true })).toMatchObject({
			success: false,
			error: expect.stringMatching(/opted out/),
		});

		await setEloEnabled(rival.id, true);
		await setEloEnabled(me.id, false);
		expect((await createGame({ player2Id: rival.id, won: true })).success).toBe(
			false,
		);

		expect(await tenantDb().select().from(games)).toHaveLength(0);
		expect(await getUserStatsRow(me.id)).toBeUndefined();
	});
});

describe("getLeaderboard", () => {
	test("ranks this Corps' active players by unified ELO", async () => {
		await createTenant();
		const other = await createTenant();
		const [anna, bert, carl, dora] = await createPlayers(4);
		const stranger = await createUser({ tenantId: other.id });
		await setUserStats(anna.id, { currentElo: 1250, totalGames: 3, wins: 2 });
		await setUserStats(bert.id, {
			currentElo: 1400,
			peakElo: 1420,
			totalGames: 10,
			wins: 8,
		});
		await setUserStats(carl.id, { currentElo: 1300, totalGames: 0 });
		await setUserStats(dora.id, { currentElo: 1500, totalGames: 5 });
		await setEloEnabled(dora.id, false);
		await setUserStats(stranger.id, { currentElo: 2000, totalGames: 9 });
		signInAs(anna);

		const board = await getLeaderboard(10);

		expect(board.map((e) => e.userId)).toEqual([bert.id, anna.id]);
		expect(board[0]).toMatchObject({
			userName: bert.name,
			currentElo: 1400,
			peakElo: 1420,
			totalGames: 10,
			wins: 8,
			winRate: 80,
		});
	});

	test("pages with limit and offset", async () => {
		await createTenant();
		const players = await createPlayers(4);
		for (const [i, p] of players.entries()) {
			await setUserStats(p.id, { currentElo: 1300 - i * 10, totalGames: 1 });
		}

		const page2 = await getLeaderboard(2, 2);

		expect(page2.map((e) => e.currentElo)).toEqual([1280, 1270]);
	});
});

describe("game history", () => {
	test("recent games are newest first with names and the winner's ELO change", async () => {
		freezeClock("2026-10-26T19:00:00Z");
		await createTenant();
		const [anna, bert] = await createPlayers(2);
		await insertGame({
			player1Id: anna.id,
			player2Id: bert.id,
			winnerId: anna.id,
			playedAt: new Date(Date.now() - 30 * MINUTE),
			player1EloBefore: 1200,
			player1EloAfter: 1216,
			player2EloBefore: 1200,
			player2EloAfter: 1184,
		});
		const latest = await insertGame({
			player1Id: anna.id,
			player2Id: bert.id,
			winnerId: bert.id,
			player1EloBefore: 1216,
			player1EloAfter: 1199,
			player2EloBefore: 1184,
			player2EloAfter: 1201,
		});

		const recent = await getRecentGames(10);

		expect(recent).toHaveLength(2);
		expect(recent[0]).toMatchObject({
			id: latest.id,
			player1Name: anna.name,
			player2Name: bert.name,
			winnerName: bert.name,
			eloChange: 17,
		});
		expect(recent[1]?.eloChange).toBe(16);
	});

	test("recent games hide games of players who opted out", async () => {
		await createTenant();
		const [anna, bert, carl] = await createPlayers(3);
		await insertGame({
			player1Id: anna.id,
			player2Id: bert.id,
			winnerId: anna.id,
		});
		await insertGame({
			player1Id: anna.id,
			player2Id: carl.id,
			winnerId: carl.id,
		});
		await setEloEnabled(carl.id, false);

		const recent = await getRecentGames();

		expect(recent.map((g) => g.player2Id)).toEqual([bert.id]);
	});

	test("a player's games, history and stats", async () => {
		freezeClock("2026-10-20T18:00:00Z");
		await createTenant();
		const [anna, bert, carl] = await createPlayers(3);
		await insertGame({
			player1Id: anna.id,
			player2Id: bert.id,
			winnerId: anna.id,
			player1EloAfter: 1216,
			player2EloAfter: 1184,
		});
		freezeClock("2026-10-21T18:00:00Z");
		await insertGame({
			player1Id: carl.id,
			player2Id: anna.id,
			winnerId: carl.id,
			player1EloBefore: 1200,
			player1EloAfter: 1217,
			player2EloBefore: 1216,
			player2EloAfter: 1199,
		});
		await insertGame({
			player1Id: bert.id,
			player2Id: carl.id,
			winnerId: bert.id,
		});
		await setUserStats(anna.id, {
			currentElo: 1199,
			peakElo: 1216,
			totalGames: 2,
			wins: 1,
			losses: 1,
		});
		signInAs(anna);

		const mine = await getUserGames(anna.id);
		expect(mine).toHaveLength(2);
		expect(mine[0]).toMatchObject({ player1Id: carl.id, eloChange: 17 });

		expect(await getUserEloHistory(anna.id)).toEqual([
			{
				gameId: mine[1]?.id,
				eloAfter: 1216,
				playedAt: new Date("2026-10-20T18:00:00Z"),
				won: true,
				opponent: bert.name,
			},
			{
				gameId: mine[0]?.id,
				eloAfter: 1199,
				playedAt: new Date("2026-10-21T18:00:00Z"),
				won: false,
				opponent: carl.name,
			},
		]);

		expect(await getUserStats(anna.id)).toMatchObject({
			userId: anna.id,
			userName: anna.name,
			currentElo: 1199,
			peakElo: 1216,
			totalGames: 2,
			winRate: 50,
		});
	});
});

describe("opponent picker", () => {
	test("lists other members who take part in the ranking, by name", async () => {
		await createTenant();
		const me = await createUser({ name: "Mia" });
		const zoe = await createUser({ name: "Zoe" });
		const ben = await createUser({ name: "Ben" });
		const out = await createUser({ name: "Otto" });
		await setEloEnabled(out.id, false);
		await setEloEnabled(zoe.id, true);
		signInAs(me);

		const users = await getAllUsersExcept();

		expect(users.map((u) => u.name)).toEqual(["Ben", "Zoe"]);
		expect(users.map((u) => u.id)).toEqual([ben.id, zoe.id]);
	});
});
