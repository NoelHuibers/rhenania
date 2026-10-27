import { describe, expect, test } from "vitest";

import { calculateEloChange, DEFAULT_ELO } from "./elo";

// Expected score E = 1 / (1 + 10^((Rb - Ra) / 400)), change = round(K * (S - E)).
// For a 200 point gap E(favourite) = 0.7597, for 800 points 0.9901.

describe("calculateEloChange", () => {
	test("new players start at 1200", () => {
		expect(DEFAULT_ELO).toBe(1200);
	});

	test("equal ratings: winner +16, loser -16 with K=32", () => {
		expect(calculateEloChange(1200, 1200, 0, 0, true)).toEqual({
			player1NewElo: 1216,
			player2NewElo: 1184,
			eloChange: 16,
		});
		expect(calculateEloChange(1200, 1200, 0, 0, false)).toEqual({
			player1NewElo: 1184,
			player2NewElo: 1216,
			eloChange: 16,
		});
	});

	test("favourite beating a 200-point underdog gains 8", () => {
		// 32 * (1 - 0.7597) = 7.69 -> 8
		expect(calculateEloChange(1400, 1200, 0, 0, true)).toEqual({
			player1NewElo: 1408,
			player2NewElo: 1192,
			eloChange: 8,
		});
	});

	test("upset: the 200-point underdog gains 24", () => {
		// 32 * (1 - 0.2403) = 24.31 -> 24
		expect(calculateEloChange(1200, 1400, 0, 0, true)).toEqual({
			player1NewElo: 1224,
			player2NewElo: 1376,
			eloChange: 24,
		});
	});

	test("an 800-point favourite gains nothing for a win", () => {
		// 32 * (1 - 0.9901) = 0.32 -> 0, the underdog loses 0 as well
		expect(calculateEloChange(2000, 1200, 0, 0, true)).toEqual({
			player1NewElo: 2000,
			player2NewElo: 1200,
			eloChange: 0,
		});
	});

	test("K drops to 24 from the 30th game on", () => {
		// Winner has 30 games (K=24), loser 29 games (K=32)
		expect(calculateEloChange(1200, 1200, 30, 29, true)).toEqual({
			player1NewElo: 1212,
			player2NewElo: 1184,
			eloChange: 12,
		});
		expect(calculateEloChange(1200, 1200, 29, 30, true)).toMatchObject({
			player1NewElo: 1216,
			player2NewElo: 1188,
		});
	});

	test("K drops to 16 at 2400, regardless of game count", () => {
		expect(calculateEloChange(2400, 2400, 0, 500, true)).toEqual({
			player1NewElo: 2408,
			player2NewElo: 2392,
			eloChange: 8,
		});
		// 2399 is still below the threshold: K=32 for a new player
		expect(calculateEloChange(2399, 2399, 0, 0, true).player1NewElo).toBe(2415);
	});
});
