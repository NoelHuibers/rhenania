import { eq } from "drizzle-orm";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
	defaultAchievements,
	seedAchievements,
} from "~/lib/achievements/version1";
import { crossTenantGames } from "~/server/db/control-schema";
import { achievements, users } from "~/server/db/schema";
import {
	advanceClock,
	createDrinkWith,
	DAY,
	freezeClock,
	HOUR,
	insertGame,
	insertOrder,
	MINUTE,
	progressOf,
	seedAchievementDefinitions,
	unlockedKeys,
	useServerTimeZone,
} from "../../../../test/factories/game";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";
import { testState } from "../../../../test/state";
import {
	checkAndUnlockAchievements,
	recalculateAllAchievements,
} from "./tracking";

setupTestDatabases();
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

type Drink = Awaited<ReturnType<typeof createDrinkWith>>;

/** Books an order (at the frozen clock) and runs the order event like `createOrder`. */
async function order(
	user: TestUser,
	drink: Drink,
	amount = 1,
	opts: { bookingFor?: string; at?: Date } = {},
) {
	await insertOrder({
		user,
		drink,
		amount,
		bookingFor: opts.bookingFor,
		createdAt: opts.at,
	});
	await checkAndUnlockAchievements(user.id, "order_created", {
		drinkName: drink.name,
		drinkId: drink.id,
		amount,
		total: drink.price * amount,
		bookingFor: opts.bookingFor ?? null,
	});
}

async function setup(at = "2026-10-26T18:00:00Z") {
	freezeClock(at);
	await createTenant();
	await seedAchievementDefinitions();
	const user = await createUser({ name: "Fuchs" });
	const pils = await createDrinkWith({ name: "Pils", price: 1.5 });
	return { user, pils };
}

describe("achievement catalogue (version 1)", () => {
	test("seeds every definition once, idempotently", async () => {
		await createTenant();
		vi.spyOn(console, "log").mockImplementation(() => {});

		await seedAchievements();
		await seedAchievements();

		const rows = await tenantDb().select().from(achievements);
		expect(rows).toHaveLength(defaultAchievements.length);
		expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
		expect(rows.every((r) => r.isActive && r.targetValue !== null)).toBe(true);
	});
});

describe("order achievements", () => {
	test("the first beer unlocks Spefuchs and the first tab", async () => {
		const { user, pils } = await setup();

		await order(user, pils);

		expect(await unlockedKeys(user.id)).toEqual(["first_tab", "spefuchs"]);
		expect(await progressOf(user.id, "fuchs")).toBe(1);
		expect(await progressOf(user.id, "big_spender")).toBe(1.5);
	});

	test("beer milestones unlock exactly at their target", async () => {
		const { user, pils } = await setup();
		await insertOrder({ user, drink: pils, amount: 28 });

		await order(user, pils);
		expect(await unlockedKeys(user.id)).not.toContain("fuchs");
		expect(await progressOf(user.id, "fuchs")).toBe(29);

		await order(user, pils);
		expect(await unlockedKeys(user.id)).toContain("fuchs");
		expect(await progressOf(user.id, "cb")).toBe(30);
	});

	test("unlocked and deactivated achievements are no longer tracked", async () => {
		const { user, pils } = await setup();
		await order(user, pils);
		await tenantDb()
			.update(achievements)
			.set({ isActive: false })
			.where(eq(achievements.key, "fuchs"));

		await order(user, pils, 3);

		expect(await progressOf(user.id, "spefuchs")).toBe(1);
		expect(await progressOf(user.id, "fuchs")).toBe(1);
		expect(await progressOf(user.id, "cb")).toBe(4);
	});

	test("special drinks: Sekt, a full crate, an alcohol-free crate", async () => {
		const { user } = await setup();
		const sekt = await createDrinkWith({ name: "Rotkäppchen Sekt" });
		const crate = await createDrinkWith({
			name: "Pils alkoholfrei",
			kastengroesse: 24,
		});

		await order(user, sekt);
		expect(await unlockedKeys(user.id)).toContain("kaisersflotte");

		await order(user, crate, 23);
		expect(await unlockedKeys(user.id)).not.toContain("kisteoderliste");

		await order(user, crate, 24);
		expect(await unlockedKeys(user.id)).toEqual(
			expect.arrayContaining(["kisteoderliste", "alkoholfrei"]),
		);
	});

	test("without a crate size, an alcohol-free crate is 20 and no full crate counts", async () => {
		const { user } = await setup();
		const loose = await createDrinkWith({ name: "Radler alkoholfrei" });

		await order(user, loose, 19);
		expect(await unlockedKeys(user.id)).not.toContain("alkoholfrei");

		await order(user, loose, 20);
		expect(await unlockedKeys(user.id)).toContain("alkoholfrei");
		expect(await unlockedKeys(user.id)).not.toContain("kisteoderliste");
	});

	test("five different drinks make a tasting", async () => {
		const { user } = await setup();
		for (const name of ["Pils", "Helles", "Weizen", "Radler", "Dunkel"]) {
			await order(user, await createDrinkWith({ name }));
		}

		expect(await unlockedKeys(user.id)).toContain("biertasting");
		expect(await progressOf(user.id, "radler")).toBe(1);
	});

	test("ten more Hell than Pils picks the light side", async () => {
		const { user, pils } = await setup();
		const hell = await createDrinkWith({ name: "Oettinger Hell" });
		await order(user, pils);
		await order(user, hell, 10);
		expect(await progressOf(user.id, "helleseite")).toBe(9);

		await order(user, hell);

		expect(await unlockedKeys(user.id)).toContain("helleseite");
		expect(await progressOf(user.id, "dunkleseite")).toBe(-10);
	});

	test("beers booked for a CBesuch count towards the CBesuch series", async () => {
		const { user, pils } = await setup();
		await insertOrder({ user, drink: pils, amount: 50 });

		await order(user, pils, 99, { bookingFor: "CBesuch Hassia" });
		expect(await progressOf(user.id, "cbesuch")).toBe(99);

		await order(user, pils, 1, { bookingFor: "CBesuch Hassia" });
		expect(await unlockedKeys(user.id)).toContain("cbesuch");
	});

	test("ten orders within an hour is a golden hour", async () => {
		const { user, pils } = await setup();
		await insertOrder({
			user,
			drink: pils,
			createdAt: new Date(Date.now() - 2 * HOUR),
		});
		for (let i = 0; i < 9; i++) {
			await insertOrder({
				user,
				drink: pils,
				createdAt: new Date(Date.now() - i * 5 * MINUTE),
			});
		}

		await checkAndUnlockAchievements(user.id, "order_created");
		expect(await progressOf(user.id, "goldenestunde")).toBe(9);

		await order(user, pils);
		expect(await unlockedKeys(user.id)).toContain("goldenestunde");
	});

	test("four beers between 5 and 8 in the morning", async () => {
		// 05:30 UTC = 06:30 Berlin: inside the window in both zones
		const { user, pils } = await setup("2026-01-15T05:30:00Z");
		await insertOrder({
			user,
			drink: pils,
			amount: 3,
			createdAt: new Date("2026-01-15T05:10:00Z"),
		});
		await insertOrder({
			user,
			drink: pils,
			amount: 5,
			createdAt: new Date("2026-01-14T05:10:00Z"),
		});

		await order(user, pils);

		expect(await unlockedKeys(user.id)).toContain("fruhaufsteher");
	});

	test("ten beers on May 1st", async () => {
		const { user, pils } = await setup("2026-05-01T12:00:00Z");
		await insertOrder({
			user,
			drink: pils,
			amount: 9,
			createdAt: new Date("2026-04-30T12:00:00Z"),
		});
		await insertOrder({
			user,
			drink: pils,
			amount: 6,
			createdAt: new Date("2026-05-01T10:00:00Z"),
		});

		await order(user, pils, 3);
		expect(await progressOf(user.id, "erstermai")).toBe(9);

		await order(user, pils);
		expect(await unlockedKeys(user.id)).toContain("erstermai");
	});

	test("consecutive weekends with an order", async () => {
		// Saturday 2026-10-24, 14:00 UTC
		const { user, pils } = await setup("2026-10-24T14:00:00Z");
		for (const at of ["2026-10-03", "2026-10-11", "2026-10-17", "2026-09-19"]) {
			await insertOrder({
				user,
				drink: pils,
				createdAt: new Date(`${at}T14:00:00Z`),
			});
		}

		await order(user, pils);

		// 24.10., 17./18.10., 10./11.10. and 3./4.10. in a row; 26./27.09. missing
		expect(await progressOf(user.id, "wocheende")).toBe(4);
	});

	test("distinct order days count towards Dedication", async () => {
		const { user, pils } = await setup("2026-10-26T12:00:00Z");
		await insertOrder({
			user,
			drink: pils,
			createdAt: new Date("2026-10-24T12:00:00Z"),
		});
		await insertOrder({
			user,
			drink: pils,
			createdAt: new Date("2026-10-25T12:00:00Z"),
		});
		await insertOrder({
			user,
			drink: pils,
			createdAt: new Date("2026-10-25T13:00:00Z"),
		});

		await order(user, pils);

		expect(await progressOf(user.id, "dedication")).toBe(3);
	});

	test("a year-old account celebrates its beer birthday", async () => {
		freezeClock("2025-10-01T12:00:00Z");
		await createTenant();
		await seedAchievementDefinitions();
		const user = await createUser();
		const pils = await createDrinkWith({ name: "Pils" });
		freezeClock("2026-10-26T12:00:00Z");

		await order(user, pils);

		expect(await unlockedKeys(user.id)).toContain("biergeburtstag");
	});

	test("the beer birthday needs a year, not a day (#140)", async () => {
		const { user, pils } = await setup("2026-10-01T12:00:00Z");
		advanceClock(2 * DAY);

		await order(user, pils);

		expect(await unlockedKeys(user.id)).not.toContain("biergeburtstag");
	});
});

describe("game achievements", () => {
	test("first game, first win, and a three-game winning streak", async () => {
		const { user } = await setup();
		const rival = await createUser();
		const play = async (won: boolean) => {
			advanceClock(MINUTE);
			await insertGame({
				player1Id: user.id,
				player2Id: rival.id,
				winnerId: won ? user.id : rival.id,
			});
			await checkAndUnlockAchievements(user.id, "game_played");
			await checkAndUnlockAchievements(user.id, won ? "game_won" : "game_lost");
		};

		await play(false);
		expect(await unlockedKeys(user.id)).toEqual(["tierlunge"]);
		expect(await progressOf(user.id, "winning_streak_3")).toBe(0);

		await play(true);
		await play(true);
		expect(await unlockedKeys(user.id)).toEqual(["erstersieg", "tierlunge"]);
		expect(await progressOf(user.id, "winning_streak_3")).toBe(2);

		await play(false);
		expect(await progressOf(user.id, "winning_streak_3")).toBe(0);

		await play(true);
		await play(true);
		await play(true);
		expect(await unlockedKeys(user.id)).toContain("winning_streak_3");
		expect(await progressOf(user.id, "winning_streak_5")).toBe(3);
		expect(await progressOf(user.id, "jungerfuchs")).toBe(7);
	});

	test("a game on each of the last seven days is a perfect week", async () => {
		const { user } = await setup("2026-10-26T13:00:00Z");
		const rival = await createUser();
		for (let d = 6; d >= 0; d--) {
			await insertGame({
				player1Id: user.id,
				player2Id: rival.id,
				winnerId: rival.id,
				playedAt: new Date(Date.now() - d * DAY - HOUR),
			});
		}

		await checkAndUnlockAchievements(user.id, "game_played");

		expect(await unlockedKeys(user.id)).toContain("perfektewoche");
	});

	test("playing on October 3rd defends Germany at the bar", async () => {
		const { user } = await setup("2026-10-03T15:00:00Z");

		await checkAndUnlockAchievements(user.id, "game_played");
		expect(await unlockedKeys(user.id)).toContain("deutschland");

		const other = await createUser();
		freezeClock("2026-10-04T15:00:00Z");
		await checkAndUnlockAchievements(other.id, "game_played");
		expect(await unlockedKeys(other.id)).not.toContain("deutschland");
	});
});

describe("cross-Corps games (#141)", () => {
	async function crossGame(opts: {
		user: TestUser;
		userTenantId: string;
		rival: TestUser;
		rivalTenantId: string;
		won: boolean;
		playedAt?: Date;
	}) {
		await controlDb()
			.insert(crossTenantGames)
			.values({
				player1Id: opts.user.id,
				player1TenantId: opts.userTenantId,
				player2Id: opts.rival.id,
				player2TenantId: opts.rivalTenantId,
				winnerId: opts.won ? opts.user.id : opts.rival.id,
				playedAt: opts.playedAt ?? new Date(),
			});
	}

	test("count in the Corps the player played for, not in their other Corps", async () => {
		freezeClock("2026-10-26T18:00:00Z");
		const home = await createTenant();
		const second = await createTenant();
		const other = await createTenant();
		await seedAchievementDefinitions(home.id);
		await seedAchievementDefinitions(second.id);
		const user = await createUser({ tenantId: home.id });
		await tenantDb(second.id)
			.insert(users)
			.values({ ...user, emailVerified: true });
		const rival = await createUser({ tenantId: other.id });
		await crossGame({
			user,
			userTenantId: second.id,
			rival,
			rivalTenantId: other.id,
			won: true,
		});

		for (const tenantId of [home.id, second.id]) {
			await checkAndUnlockAchievements(user.id, "game_played", undefined, {
				tenantId,
			});
			await checkAndUnlockAchievements(user.id, "game_won", undefined, {
				tenantId,
			});
		}

		expect(await unlockedKeys(user.id, home.id)).toEqual([]);
		expect(await unlockedKeys(user.id, second.id)).toEqual([
			"erstersieg",
			"tierlunge",
		]);
	});

	test("streaks and game days mix own and cross-Corps games", async () => {
		const { user } = await setup("2026-10-26T13:00:00Z");
		const tenantId = testState.tenantId as string;
		const mate = await createUser();
		const other = await createTenant();
		const rival = await createUser({ tenantId: other.id });
		for (let d = 6; d >= 0; d--) {
			const playedAt = new Date(Date.now() - d * DAY - HOUR);
			if (d % 2 === 0) {
				await crossGame({
					user,
					userTenantId: tenantId,
					rival,
					rivalTenantId: other.id,
					won: true,
					playedAt,
				});
			} else {
				await insertGame({
					player1Id: mate.id,
					player2Id: user.id,
					winnerId: user.id,
					playedAt,
				});
			}
		}

		await checkAndUnlockAchievements(user.id, "game_played");
		await checkAndUnlockAchievements(user.id, "game_won");

		expect(await unlockedKeys(user.id)).toEqual(
			expect.arrayContaining(["perfektewoche", "winning_streak_5"]),
		);
		expect(await progressOf(user.id, "winning_streak_10")).toBe(7);
		expect(await progressOf(user.id, "jungerfuchs")).toBe(7);
	});

	test("recalculation includes cross-Corps games", async () => {
		const { user } = await setup("2026-10-26T13:00:00Z");
		const tenantId = testState.tenantId as string;
		const other = await createTenant();
		const rival = await createUser({ tenantId: other.id });
		await crossGame({
			user,
			userTenantId: tenantId,
			rival,
			rivalTenantId: other.id,
			won: true,
			playedAt: new Date("2026-10-03T12:00:00Z"),
		});

		await recalculateAllAchievements(user.id);

		expect(await unlockedKeys(user.id)).toEqual(
			expect.arrayContaining(["deutschland", "erstersieg", "tierlunge"]),
		);
	});
});

describe("account achievements", () => {
	test("account creation and profile picture", async () => {
		const { user } = await setup();

		await checkAndUnlockAchievements(user.id, "account_created");
		await checkAndUnlockAchievements(user.id, "profile_picture_set");

		expect(await unlockedKeys(user.id)).toEqual(["bild", "willkommen"]);
	});

	test("tracking errors are logged, never thrown", async () => {
		await setup();
		const log = vi.spyOn(console, "error").mockImplementation(() => {});

		// No tenant user row: the progress insert violates its foreign key
		await expect(
			checkAndUnlockAchievements("ghost", "account_created"),
		).resolves.toBeUndefined();
		expect(log).toHaveBeenCalled();
	});
});

describe("recalculateAllAchievements", () => {
	test("achievements without a rule are left alone", async () => {
		const { user, pils } = await setup();
		await tenantDb().insert(achievements).values({
			key: "custom",
			name: "Custom",
			description: "No rule yet",
			category: "special",
			targetValue: 1,
		});

		await order(user, pils);
		await recalculateAllAchievements(user.id);

		expect(await unlockedKeys(user.id)).not.toContain("custom");
		expect(await progressOf(user.id, "custom")).toBeUndefined();
	});

	test("rebuilds unlocks and progress from historical data", async () => {
		const { user, pils } = await setup("2026-10-26T12:00:00Z");
		const sekt = await createDrinkWith({ name: "Sekt", kastengroesse: 6 });
		const rival = await createUser();
		await insertOrder({
			user,
			drink: pils,
			amount: 31,
			createdAt: new Date("2026-10-03T12:00:00Z"),
		});
		await insertOrder({
			user,
			drink: sekt,
			amount: 6,
			createdAt: new Date("2026-10-04T12:00:00Z"),
		});
		for (let i = 0; i < 3; i++) {
			await insertGame({
				player1Id: user.id,
				player2Id: rival.id,
				winnerId: user.id,
				playedAt: new Date(Date.UTC(2026, 9, 3 + i, 12)),
			});
		}

		await recalculateAllAchievements(user.id);

		expect(await unlockedKeys(user.id)).toEqual([
			"deutschland",
			"dunkleseite",
			"erstersieg",
			"first_tab",
			"fuchs",
			"kaisersflotte",
			"kisteoderliste",
			"spefuchs",
			"tierlunge",
			"willkommen",
			"winning_streak_3",
		]);
		expect(await progressOf(user.id, "cb")).toBe(37);
		expect(await progressOf(user.id, "perfektewoche")).toBe(3);
		expect(await progressOf(user.id, "bild")).toBe(0);
	});

	test("keeps existing unlocks and adds the profile picture", async () => {
		const { user, pils } = await setup();
		await order(user, pils);
		await tenantDb()
			.update(users)
			.set({ image: "https://example.test/me.png" })
			.where(eq(users.id, user.id));

		await recalculateAllAchievements(user.id);

		expect(await unlockedKeys(user.id)).toEqual([
			"bild",
			"first_tab",
			"spefuchs",
			"willkommen",
		]);
	});
});

describe("server time zone (#15)", () => {
	describe("on a Europe/Berlin server", () => {
		useServerTimeZone("Europe/Berlin");

		test("an order at 00:30 on January 1st rings in the new year", async () => {
			const { user, pils } = await setup("2026-12-31T23:30:00Z");

			await order(user, pils);

			expect(await unlockedKeys(user.id)).toContain("neujahr");
		});
	});

	describe("on a UTC server", () => {
		useServerTimeZone("UTC");

		test("an order at 00:30 Berlin time on January 1st rings in the new year (#15)", async () => {
			const { user, pils } = await setup("2026-12-31T23:30:00Z");

			await order(user, pils);

			expect(await unlockedKeys(user.id)).toContain("neujahr");
		});

		test("an order at 23:30 Berlin time on December 31st is not the new year (#15)", async () => {
			const { user, pils } = await setup("2026-12-31T22:30:00Z");

			await order(user, pils);

			expect(await unlockedKeys(user.id)).not.toContain("neujahr");
		});

		test("the 5-8 o'clock window is Berlin summer time (#15)", async () => {
			// 04:30 UTC = 06:30 CEST; three earlier beers at 05:10 CEST
			const { user, pils } = await setup("2026-07-15T04:30:00Z");
			await insertOrder({
				user,
				drink: pils,
				amount: 3,
				createdAt: new Date("2026-07-15T03:10:00Z"),
			});
			// 02:30 CEST: before the window
			await insertOrder({
				user,
				drink: pils,
				amount: 5,
				createdAt: new Date("2026-07-15T00:30:00Z"),
			});

			await order(user, pils);
			expect(await unlockedKeys(user.id)).toContain("fruhaufsteher");
		});

		test("beers before 5 o'clock Berlin time are not early birds (#15)", async () => {
			// 05:30 UTC in summer is 07:30 CEST; the earlier beers were at 04:30 CEST
			const { user, pils } = await setup("2026-07-15T05:30:00Z");
			await insertOrder({
				user,
				drink: pils,
				amount: 3,
				createdAt: new Date("2026-07-15T02:30:00Z"),
			});

			await order(user, pils);
			expect(await unlockedKeys(user.id)).not.toContain("fruhaufsteher");
		});

		test("four beers between midnight and 1 o'clock Berlin time (#15)", async () => {
			// 22:40 UTC = 00:40 CEST on the 16th
			const { user, pils } = await setup("2026-07-15T22:40:00Z");
			await insertOrder({
				user,
				drink: pils,
				amount: 3,
				createdAt: new Date("2026-07-15T22:05:00Z"),
			});

			await order(user, pils);
			expect(await unlockedKeys(user.id)).toContain("berry");
		});

		test("May 1st starts at midnight Berlin time (#15)", async () => {
			// 22:30 UTC on April 30th = 00:30 CEST on May 1st
			const { user, pils } = await setup("2026-04-30T22:30:00Z");
			await insertOrder({
				user,
				drink: pils,
				amount: 4,
				createdAt: new Date("2026-04-30T21:30:00Z"), // 23:30 on April 30th
			});
			await insertOrder({
				user,
				drink: pils,
				amount: 9,
				createdAt: new Date("2026-04-30T22:10:00Z"), // 00:10 on May 1st
			});

			await order(user, pils);

			expect(await progressOf(user.id, "erstermai")).toBe(10);
			expect(await unlockedKeys(user.id)).toContain("erstermai");
		});

		test("Friday 23:30 UTC is already Saturday in Berlin (#15)", async () => {
			// Friday 2026-10-23 22:30 UTC = Saturday 00:30 CEST
			const { user, pils } = await setup("2026-10-23T22:30:00Z");
			// Sunday 2026-10-18 21:30 UTC = 23:30 CEST: the weekend before
			await insertOrder({
				user,
				drink: pils,
				createdAt: new Date("2026-10-18T21:30:00Z"),
			});

			await order(user, pils);

			expect(await progressOf(user.id, "wocheende")).toBe(2);
		});

		test("a game at 00:30 Berlin time on October 3rd defends Germany (#15)", async () => {
			const { user } = await setup("2026-10-02T22:30:00Z");

			await checkAndUnlockAchievements(user.id, "game_played");

			expect(await unlockedKeys(user.id)).toContain("deutschland");
		});

		test("recalculation uses Berlin days and hours (#15)", async () => {
			const { user, pils } = await setup("2026-10-26T12:00:00Z");
			const rival = await createUser();
			for (const at of [
				"2025-12-31T23:20:00Z", // 00:20 on New Year's Day
				"2026-04-30T22:15:00Z", // 00:15 on May 1st
				"2026-07-15T03:30:00Z", // 05:30 CEST
			]) {
				await insertOrder({
					user,
					drink: pils,
					amount: 4,
					createdAt: new Date(at),
				});
			}
			await insertGame({
				player1Id: user.id,
				player2Id: rival.id,
				winnerId: user.id,
				playedAt: new Date("2026-10-02T22:30:00Z"), // 00:30 on October 3rd
			});

			await recalculateAllAchievements(user.id);

			expect(await unlockedKeys(user.id)).toEqual(
				expect.arrayContaining([
					"berry",
					"deutschland",
					"fruhaufsteher",
					"neujahr",
				]),
			);
			expect(await progressOf(user.id, "erstermai")).toBe(4);
			expect(await progressOf(user.id, "dedication")).toBe(3);
		});
	});

	test("orders at 23:30 and 00:30 Berlin time are two Dedication days (#15)", async () => {
		const { user, pils } = await setup("2026-03-11T08:00:00Z");
		await insertOrder({
			user,
			drink: pils,
			createdAt: new Date("2026-03-10T22:30:00Z"),
		});
		await insertOrder({
			user,
			drink: pils,
			createdAt: new Date("2026-03-10T23:30:00Z"),
		});

		await checkAndUnlockAchievements(user.id, "order_created");

		expect(await progressOf(user.id, "dedication")).toBe(2);
	});
});
