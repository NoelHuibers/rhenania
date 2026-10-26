// Query budget of achievement tracking (#22). The rules themselves are
// covered in tracking.test.ts; this file pins how many round trips one
// event costs, independent of the catalogue size and the user's history.

import { afterEach, describe, expect, test, vi } from "vitest";

import { achievementProgress } from "~/server/db/schema";
import { requireTenantId } from "~/server/lib/tenant-context";
import {
	createDrinkWith,
	freezeClock,
	insertGame,
	insertOrder,
	progressOf,
	seedAchievementDefinitions,
	unlockedKeys,
} from "../../../../test/factories/game";
import {
	countQueries,
	createTenant,
	createUser,
	setupTestDatabases,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";
import { checkAndUnlockAchievements } from "./tracking";

setupTestDatabases();
afterEach(() => vi.useRealTimers());

type Drink = Awaited<ReturnType<typeof createDrinkWith>>;

// A Saturday afternoon, so the weekend rule loads its statistic as well.
async function setup(at = "2026-10-24T14:00:00Z") {
	freezeClock(at);
	await createTenant();
	await seedAchievementDefinitions();
	const user = await createUser({ name: "Fuchs" });
	const pils = await createDrinkWith({ name: "Pils", price: 1.5 });
	return { user, pils };
}

function orderEvent(user: TestUser, drink: Drink, amount = 1) {
	return checkAndUnlockAchievements(user.id, "order_created", {
		drinkName: drink.name,
		drinkId: drink.id,
		amount,
		total: drink.price * amount,
		bookingFor: null,
	});
}

describe("achievement tracking query budget (#22)", () => {
	test("an order costs 3 round trips (was ~50), however long the history", async () => {
		const { user, pils } = await setup();
		await insertOrder({ user, drink: pils, amount: 3 });
		// The tenant is resolved from the request host once and then cached;
		// warm that cache so only the tracking itself is counted.
		await requireTenantId();

		const first = await countQueries(() => orderEvent(user, pils));

		// Catalogue, one batch of statistics, one batch of writes.
		expect(first.log.map((e) => e.kind)).toEqual(["execute", "batch", "batch"]);
		expect(first.writes).toBe(1);
		expect(await unlockedKeys(user.id)).toEqual(["first_tab", "spefuchs"]);

		for (let i = 0; i < 20; i++) {
			await insertOrder({
				user,
				drink: await createDrinkWith({ name: `Bier ${i}` }),
				createdAt: new Date(Date.now() - i * 86_400_000),
			});
		}
		const later = await countQueries(() => orderEvent(user, pils));

		expect(later.total).toBe(3);
		expect(await unlockedKeys(user.id)).toContain("biertasting");
		expect(await progressOf(user.id, "fuchs")).toBe(23);
	});

	test("a game costs one tenant round trip per step plus one control batch", async () => {
		const { user } = await setup();
		const rival = await createUser();
		await insertGame({
			player1Id: user.id,
			player2Id: rival.id,
			winnerId: user.id,
		});
		await requireTenantId(); // warm the host → tenant cache, see above

		const played = await countQueries(() =>
			checkAndUnlockAchievements(user.id, "game_played"),
		);
		const won = await countQueries(() =>
			checkAndUnlockAchievements(user.id, "game_won"),
		);

		expect(played).toMatchObject({ tenant: 3, control: 1 });
		expect(won).toMatchObject({ tenant: 3, control: 1 });
		expect(await unlockedKeys(user.id)).toEqual(["erstersieg", "tierlunge"]);
	});

	test("only changed progress is written", async () => {
		const { user } = await setup();
		const rival = await createUser();
		await insertGame({
			player1Id: user.id,
			player2Id: rival.id,
			winnerId: rival.id,
		});
		await checkAndUnlockAchievements(user.id, "game_lost");
		const before = await tenantDb().select().from(achievementProgress);

		const again = await countQueries(() =>
			checkAndUnlockAchievements(user.id, "game_lost"),
		);

		// The streak stays 0: catalogue read, nothing to load or write.
		expect(again).toMatchObject({ total: 1, writes: 0 });
		expect(await tenantDb().select().from(achievementProgress)).toEqual(before);
		expect(await progressOf(user.id, "winning_streak_3")).toBe(0);
	});

	test("an event whose achievements are all unlocked costs one query", async () => {
		const { user } = await setup();
		await checkAndUnlockAchievements(user.id, "account_created");

		const again = await countQueries(() =>
			checkAndUnlockAchievements(user.id, "account_created"),
		);

		expect(again).toMatchObject({ total: 1, writes: 0 });
		expect(await unlockedKeys(user.id)).toEqual(["willkommen"]);
	});
});
