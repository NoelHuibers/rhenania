// The leaderboard windows are computed by SQLite (`unixepoch('now', …)`), so
// these tests place orders relative to the real clock instead of faking it.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { drinks } from "~/server/db/schema";
import { createOrderRow, daysAgo } from "../../../../test/factories/inventory";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";
import { useServerTimeZone } from "../../../../test/server-tz";
import { getConsumptionLast6MonthsByDrink } from "./consumption";
import {
	getLeaderboardLast6Months,
	getMonthlyGrowthRate,
	getTotalConsumption,
} from "./leaderboard";

setupTestDatabases();

async function drinkWithVolume(name: string, volume: number | null) {
	const [drink] = await tenantDb()
		.insert(drinks)
		.values({ name, price: 1, volume })
		.returning();
	if (!drink) {
		throw new Error("Could not create drink");
	}
	return drink;
}

beforeEach(async () => {
	await createTenant();
	signInAs(await createUser());
});

describe("leaderboard", () => {
	let max: TestUser;
	let moritz: TestUser;
	let fritz: TestUser;

	/**
	 * Personal liters:            last 31 d   previous 31 d   6 months
	 *   Fritz                       0           4               4
	 *   Max                         2           1               3
	 *   Moritz                      1.5         0               1.5
	 * Group bookings (CC): 51 l, never on the leaderboard.
	 */
	async function seed() {
		max = await createUser({ name: "Max" });
		moritz = await createUser({ name: "Moritz" });
		fritz = await createUser({ name: "Fritz" });
		const ute = await createUser({ name: "Ute" });
		const pils = await drinkWithVolume("Pils", 0.5);
		const wein = await drinkWithVolume("Wein", 0.75);
		const snack = await drinkWithVolume("Erdnüsse", null);

		await createOrderRow({
			drink: pils,
			user: max,
			amount: 4,
			createdAt: daysAgo(5),
		});
		await createOrderRow({
			drink: pils,
			user: max,
			amount: 2,
			createdAt: daysAgo(40),
		});
		await createOrderRow({
			drink: pils,
			user: max,
			amount: 10,
			createdAt: daysAgo(200),
		});
		await createOrderRow({
			drink: wein,
			user: moritz,
			amount: 2,
			createdAt: daysAgo(10),
		});
		await createOrderRow({
			drink: snack,
			user: moritz,
			amount: 5,
			createdAt: daysAgo(10),
		});
		await createOrderRow({
			drink: pils,
			user: fritz,
			amount: 8,
			createdAt: daysAgo(50),
		});
		await createOrderRow({
			drink: pils,
			user: moritz,
			amount: 100,
			bookingFor: "CC",
			createdAt: daysAgo(3),
		});
		await createOrderRow({
			drink: pils,
			user: ute,
			amount: 2,
			bookingFor: "CC",
			createdAt: daysAgo(3),
		});
	}

	test("ranks members by personal liters over six months", async () => {
		await seed();

		expect(await getLeaderboardLast6Months()).toEqual([
			{
				userId: fritz.id,
				userName: "Fritz",
				avatar: null,
				liters: 4,
				prevLiters: 0,
				changePct: -100,
			},
			{
				userId: max.id,
				userName: "Max",
				avatar: null,
				liters: 3,
				// `prevLiters` carries the last 31 days, compared with the 31 before.
				prevLiters: 2,
				changePct: 100,
			},
			{
				userId: moritz.id,
				userName: "Moritz",
				avatar: null,
				liters: 1.5,
				prevLiters: 1.5,
				changePct: null,
			},
		]);
	});

	test("honours the limit", async () => {
		await seed();

		const top = await getLeaderboardLast6Months({ limit: 2 });

		expect(top.map((e) => e.userName)).toEqual(["Fritz", "Max"]);
	});

	test("monthly growth compares personal liters of the last two 31-day windows", async () => {
		await seed();

		// (3.5 − 5) / 5
		expect(await getMonthlyGrowthRate()).toBe(-30);
	});

	test("total consumption counts every order of the last six months", async () => {
		await seed();

		// 4 + 3 + 1.5 personal + 51 group bookings.
		expect(await getTotalConsumption()).toBe(59.5);
	});

	test("an empty tenant has no ranking and no growth rate", async () => {
		expect(await getLeaderboardLast6Months()).toEqual([]);
		expect(await getMonthlyGrowthRate()).toBeNull();
		expect(await getTotalConsumption()).toBe(0);
	});
});

// The month axis is computed from the JS clock, so these tests fake it.
describe("getConsumptionLast6MonthsByDrink", () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	// Berlin midnight on the 1st of May … October 2026 (CEST, UTC+2).
	const MONTH_STARTS = [
		"2026-04-30T22:00:00Z",
		"2026-05-31T22:00:00Z",
		"2026-06-30T22:00:00Z",
		"2026-07-31T22:00:00Z",
		"2026-08-31T22:00:00Z",
		"2026-09-30T22:00:00Z",
	];
	function midMonth(monthsBack: number) {
		return new Date(Date.UTC(2026, 9 - monthsBack, 15, 12));
	}
	function monthStart(monthsBack: number) {
		return Date.parse(MONTH_STARTS[5 - monthsBack] ?? "") / 1000;
	}

	test("buckets orders by their Berlin month, also on a UTC server (#15)", async () => {
		useServerTimeZone("UTC");
		const pils = await drinkWithVolume("Pils", 0.5);
		// 00:30 on 1 May and 1 Oct in Berlin, still April / September in UTC.
		await createOrderRow({
			drink: pils,
			amount: 2,
			createdAt: new Date("2026-04-30T22:30:00Z"),
		});
		await createOrderRow({
			drink: pils,
			amount: 4,
			createdAt: new Date("2026-09-30T22:30:00Z"),
		});
		// 23:30 on 30 April in Berlin: before the six months.
		await createOrderRow({
			drink: pils,
			amount: 8,
			createdAt: new Date("2026-04-30T21:30:00Z"),
		});
		// 23:30 on 31 October in Berlin, already November in UTC.
		await createOrderRow({
			drink: pils,
			amount: 6,
			createdAt: new Date("2026-10-31T22:30:00Z"),
		});

		const { data } = await getConsumptionLast6MonthsByDrink();

		expect(data.map((d) => [d.label, d.monthStart, d.total])).toEqual([
			["Mai 2026", monthStart(5), 1],
			["Juni 2026", monthStart(4), 0],
			["Juli 2026", monthStart(3), 0],
			["Aug. 2026", monthStart(2), 0],
			["Sept. 2026", monthStart(1), 0],
			["Okt. 2026", monthStart(0), 5],
		]);
	});

	test("buckets liters per drink into the last six months", async () => {
		const pils = await drinkWithVolume("Pils", 0.5);
		const wein = await drinkWithVolume("Wein", 0.75);
		const snack = await drinkWithVolume("Erdnüsse", null);
		const noVolume = await createDrink({ name: "ohne Volumen" });
		await createOrderRow({ drink: pils, amount: 4, createdAt: midMonth(0) });
		await createOrderRow({
			drink: pils,
			amount: 2,
			bookingFor: "CC",
			createdAt: midMonth(0),
		});
		await createOrderRow({ drink: wein, amount: 2, createdAt: midMonth(2) });
		await createOrderRow({ drink: pils, amount: 1, createdAt: midMonth(5) });
		await createOrderRow({ drink: pils, amount: 50, createdAt: midMonth(6) });
		await createOrderRow({ drink: snack, amount: 9, createdAt: midMonth(1) });
		await createOrderRow({
			drink: noVolume,
			amount: 9,
			createdAt: midMonth(1),
		});

		const { data, config } = await getConsumptionLast6MonthsByDrink();

		const p = `drink_${pils.id}`;
		const w = `drink_${wein.id}`;
		expect(
			data.map((d) => ({
				monthStart: d.monthStart,
				total: d.total,
				p: d[p],
				w: d[w],
			})),
		).toEqual([
			{ monthStart: monthStart(5), total: 0.5, p: 0.5, w: 0 },
			{ monthStart: monthStart(4), total: 0, p: 0, w: 0 },
			{ monthStart: monthStart(3), total: 0, p: 0, w: 0 },
			{ monthStart: monthStart(2), total: 1.5, p: 0, w: 1.5 },
			{ monthStart: monthStart(1), total: 0, p: 0, w: 0 },
			{ monthStart: monthStart(0), total: 3, p: 3, w: 0 },
		]);
		// Drinks without any liters get no series.
		expect(Object.keys(config).sort()).toEqual(["total", p, w].sort());
		expect(config[p]?.label).toBe("Pils");
		expect(config[w]?.label).toBe("Wein");
		expect(config[p]?.color).not.toBe(config[w]?.color);
	});
});
