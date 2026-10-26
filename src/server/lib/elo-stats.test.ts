import { describe, expect, test } from "vitest";

import {
	createPlayers,
	insertGame,
	setUserStats,
} from "../../../test/factories/game";
import {
	createTenant,
	createUser,
	setupTestDatabases,
} from "../../../test/harness";
import { getEloStatsForUser } from "./elo-stats";

setupTestDatabases();

describe("getEloStatsForUser", () => {
	test("reads the unified stats and the ELO history oldest first", async () => {
		await createTenant();
		const [anna, bert] = await createPlayers(2);
		await setUserStats(anna.id, {
			currentElo: 1199,
			peakElo: 1216,
			totalGames: 2,
			wins: 1,
			losses: 1,
		});
		await insertGame({
			player1Id: anna.id,
			player2Id: bert.id,
			winnerId: anna.id,
			playedAt: new Date("2026-10-20T18:00:00Z"),
			player1EloAfter: 1216,
		});
		await insertGame({
			player1Id: bert.id,
			player2Id: anna.id,
			winnerId: bert.id,
			playedAt: new Date("2026-10-22T18:00:00Z"),
			player2EloAfter: 1199,
		});

		const { stats, eloHistory } = await getEloStatsForUser(anna.id);

		expect(stats).toMatchObject({
			currentElo: 1199,
			peakElo: 1216,
			totalGames: 2,
			wins: 1,
			losses: 1,
		});
		expect(eloHistory).toEqual([
			{ date: "2026-10-20", elo: 1216 },
			{ date: "2026-10-22", elo: 1199 },
		]);
	});

	test("falls back to the Corps' game table when there is no stats row", async () => {
		await createTenant();
		const [anna, bert] = await createPlayers(2);
		await insertGame({
			player1Id: anna.id,
			player2Id: bert.id,
			winnerId: anna.id,
			playedAt: new Date("2026-10-20T18:00:00Z"),
			player1EloAfter: 1216,
		});
		await insertGame({
			player1Id: anna.id,
			player2Id: bert.id,
			winnerId: bert.id,
			playedAt: new Date("2026-10-21T18:00:00Z"),
			player1EloAfter: 1199,
		});

		const { stats } = await getEloStatsForUser(anna.id);

		expect(stats).toMatchObject({
			userId: anna.id,
			currentElo: 1199,
			peakElo: 1216,
			totalGames: 2,
			wins: 1,
			losses: 1,
		});
	});

	test("a player without games starts at 1200", async () => {
		await createTenant();
		const user = await createUser();

		const { stats, eloHistory } = await getEloStatsForUser(user.id);

		expect(stats).toMatchObject({
			currentElo: 1200,
			peakElo: 1200,
			totalGames: 0,
		});
		expect(eloHistory).toEqual([]);
	});

	// The chart date is taken from toISOString(), i.e. the UTC calendar day.
	test.fails("a game at 00:30 Berlin time is charted on that Berlin day (new)", async () => {
		await createTenant();
		const [anna, bert] = await createPlayers(2);
		await insertGame({
			player1Id: anna.id,
			player2Id: bert.id,
			winnerId: anna.id,
			playedAt: new Date("2026-10-25T23:30:00Z"), // 26.10. 00:30 CET
			player1EloAfter: 1216,
		});

		const { eloHistory } = await getEloStatsForUser(anna.id);

		expect(eloHistory).toEqual([{ date: "2026-10-26", elo: 1216 }]);
	});
});
