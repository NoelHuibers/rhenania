import { afterEach, describe, expect, test, vi } from "vitest";

import {
	createPlayers,
	freezeClock,
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
} from "../../../../test/harness";
import { getLeaderboard, getRecentGames } from "./game";
import { getAllUsersExcept } from "./getUsers";

// Achievements run fire-and-forget after the response; they have their own tests.
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));

setupTestDatabases();
afterEach(() => vi.useRealTimers());

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
		signInAs(players[0] as (typeof players)[number]);
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
		signInAs(anna as NonNullable<typeof anna>);
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
		signInAs(anna as NonNullable<typeof anna>);
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
