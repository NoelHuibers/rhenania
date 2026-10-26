import { describe, expect, test } from "vitest";

import { checkAndUnlockAchievements } from "~/server/actions/achievements/tracking";
import { achievements } from "~/server/db/schema";
import {
	createPlayers,
	seedAchievementDefinitions,
} from "../../../test/factories/game";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	tenantDb,
} from "../../../test/harness";
import { getAchievementUnlockPercentages } from "./achievement-stats";

setupTestDatabases();

describe("getAchievementUnlockPercentages", () => {
	test("is relative to members with at least one unlock", async () => {
		await createTenant();
		await seedAchievementDefinitions();
		const [anna, bert] = await createPlayers(2);
		await createUser(); // dormant, never unlocked anything

		expect(await getAchievementUnlockPercentages()).toEqual({});

		await checkAndUnlockAchievements(anna.id, "account_created");
		await checkAndUnlockAchievements(anna.id, "profile_picture_set");
		await checkAndUnlockAchievements(bert.id, "account_created");

		const idByKey = Object.fromEntries(
			(await tenantDb().select().from(achievements)).map((a) => [a.key, a.id]),
		);
		expect(await getAchievementUnlockPercentages()).toEqual({
			[idByKey.willkommen as string]: 100,
			[idByKey.bild as string]: 50,
		});
	});
});
