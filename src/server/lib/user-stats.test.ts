import { afterEach, describe, expect, test, vi } from "vitest";

import { userStats } from "~/server/db/control-schema";
import {
	freezeClock,
	getUserStatsRow,
	setUserStats,
} from "../../../test/factories/game";
import { controlDb, setupTestDatabases } from "../../../test/harness";
import {
	applyEloOutcome,
	getOrCreateUserStats,
	getOrCreateUserStatsBatch,
} from "./user-stats";

setupTestDatabases();
afterEach(() => vi.useRealTimers());

describe("getOrCreateUserStats", () => {
	test("seeds a 1200 row on first access and returns it afterwards", async () => {
		const seeded = await getOrCreateUserStats("u1");

		expect(seeded).toEqual({
			userId: "u1",
			currentElo: 1200,
			totalGames: 0,
			wins: 0,
			losses: 0,
			peakElo: 1200,
		});
		expect(await controlDb().select().from(userStats)).toHaveLength(1);

		await setUserStats("u1", { currentElo: 1300, totalGames: 4, wins: 3 });
		expect(await getOrCreateUserStats("u1")).toMatchObject({
			currentElo: 1300,
			totalGames: 4,
			wins: 3,
		});
		expect(await controlDb().select().from(userStats)).toHaveLength(1);
	});

	test("batch returns existing rows and seeds only the missing ones", async () => {
		await setUserStats("known", { currentElo: 1500, peakElo: 1550 });

		const stats = await getOrCreateUserStatsBatch(["known", "new"]);

		expect(stats.get("known")).toMatchObject({
			currentElo: 1500,
			peakElo: 1550,
		});
		expect(stats.get("new")).toMatchObject({ currentElo: 1200, totalGames: 0 });
		expect(await controlDb().select().from(userStats)).toHaveLength(2);
		expect((await getOrCreateUserStatsBatch([])).size).toBe(0);
	});
});

describe("applyEloOutcome", () => {
	test("first game between new players: 1216 / 1184", async () => {
		freezeClock("2026-10-26T20:15:00Z");

		const result = await applyEloOutcome("winner", "loser");

		expect(result).toEqual({
			winnerEloBefore: 1200,
			winnerEloAfter: 1216,
			loserEloBefore: 1200,
			loserEloAfter: 1184,
		});
		expect(await getUserStatsRow("winner")).toMatchObject({
			currentElo: 1216,
			peakElo: 1216,
			totalGames: 1,
			wins: 1,
			losses: 0,
			lastGameAt: new Date("2026-10-26T20:15:00Z"),
		});
		expect(await getUserStatsRow("loser")).toMatchObject({
			currentElo: 1184,
			peakElo: 1200,
			totalGames: 1,
			wins: 0,
			losses: 1,
		});
	});

	test("uses each player's own K-factor and keeps the peak", async () => {
		await setUserStats("vet", {
			currentElo: 1400,
			peakElo: 1500,
			totalGames: 40,
			wins: 25,
			losses: 15,
		});
		await setUserStats("rookie", { currentElo: 1200, totalGames: 2 });

		// Rookie upset: rookie +24 (K=32), veteran -18 (K=24 * 0.7597)
		const result = await applyEloOutcome("rookie", "vet");

		expect(result).toEqual({
			winnerEloBefore: 1200,
			winnerEloAfter: 1224,
			loserEloBefore: 1400,
			loserEloAfter: 1382,
		});
		expect(await getUserStatsRow("vet")).toMatchObject({
			currentElo: 1382,
			peakElo: 1500,
			totalGames: 41,
			losses: 16,
		});
		expect(await getUserStatsRow("rookie")).toMatchObject({
			currentElo: 1224,
			peakElo: 1224,
			wins: 1,
		});
	});

	// Read-modify-write without a transaction: the second update overwrites the first.
	test.fails("two games of the same player at once both count (#16)", async () => {
		await Promise.all([applyEloOutcome("a", "b"), applyEloOutcome("a", "c")]);

		expect(await getUserStatsRow("a")).toMatchObject({
			totalGames: 2,
			wins: 2,
		});
	});
});
