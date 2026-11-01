import { describe, expect, test } from "vitest";

import { achievements } from "~/server/db/schema";
import {
	createPlayers,
	seedAchievementDefinitions,
} from "../../../../test/factories/game";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	tenantDb,
	testScope,
} from "../../../../test/harness";
import { unlockPercentages } from "./service";
import { checkAndUnlockAchievements } from "./tracking";

setupTestDatabases();

describe("unlockPercentages", () => {
	test("is relative to members with at least one unlock", async () => {
		await createTenant();
		await seedAchievementDefinitions();
		const [anna, bert] = await createPlayers(2);
		await createUser(); // dormant, never unlocked anything

		expect(await unlockPercentages(testScope())).toEqual({});

		await checkAndUnlockAchievements(testScope(), anna.id, "account_created");
		await checkAndUnlockAchievements(
			testScope(),
			anna.id,
			"profile_picture_set",
		);
		await checkAndUnlockAchievements(testScope(), bert.id, "account_created");

		const idByKey = Object.fromEntries(
			(await tenantDb().select().from(achievements)).map((a) => [a.key, a.id]),
		);
		expect(await unlockPercentages(testScope())).toEqual({
			[idByKey.willkommen as string]: 100,
			[idByKey.bild as string]: 50,
		});
	});
});
