import { describe, expect, test } from "vitest";

import {
	achievementProgress,
	achievements,
	userAchievements,
} from "~/server/db/schema";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import { getUserAchievements } from "./actions";

setupTestDatabases();

async function createAchievement(
	key: string,
	values: Partial<typeof achievements.$inferInsert> = {},
) {
	const [row] = await tenantDb()
		.insert(achievements)
		.values({
			key,
			name: `Name ${key}`,
			description: `Beschreibung ${key}`,
			category: "drinking",
			...values,
		})
		.returning();
	if (!row) {
		throw new Error("no achievement");
	}
	return row;
}

const unlock = (userId: string, achievementId: string, unlockedAt?: Date) =>
	tenantDb()
		.insert(userAchievements)
		.values({ userId, achievementId, ...(unlockedAt ? { unlockedAt } : {}) });

describe("getUserAchievements", () => {
	test("lists active achievements with unlock state, progress and rarity share", async () => {
		await createTenant();
		const member = await createUser();
		const other = await createUser();
		const beers = await createAchievement("beers", { targetValue: 100 });
		const secret = await createAchievement("secret", { isSecret: true });
		await createAchievement("retired", { isActive: false });
		const unlockedAt = new Date("2026-06-01T08:00:00Z");
		await unlock(member.id, secret.id, unlockedAt);
		await unlock(other.id, secret.id);
		await unlock(other.id, beers.id);
		await tenantDb().insert(achievementProgress).values({
			userId: member.id,
			achievementId: beers.id,
			currentValue: 42,
		});
		signInAs(member);

		const list = await getUserAchievements();

		expect(list).toHaveLength(2);
		expect(list.find((a) => a.key === "beers")).toMatchObject({
			unlocked: false,
			unlockedAt: null,
			currentValue: 42,
			targetValue: 100,
			unlockPercent: 50,
		});
		expect(list.find((a) => a.key === "secret")).toMatchObject({
			unlocked: true,
			unlockedAt,
			isSecret: true,
			currentValue: 0,
			unlockPercent: 100,
		});
	});

	test("hides the Gründungstag while the tenant has no founding day (#36)", async () => {
		await createTenant();
		const member = await createUser();
		const founder = await createUser();
		const grundungstag = await createAchievement("grundungstag", {
			isSecret: true,
		});
		await unlock(founder.id, grundungstag.id);

		signInAs(member);
		expect((await getUserAchievements()).map((a) => a.key)).toEqual([]);

		// Already unlocked stays visible.
		signInAs(founder);
		expect((await getUserAchievements()).map((a) => a.key)).toEqual([
			"grundungstag",
		]);
	});

	test("shows the Gründungstag when the tenant has a founding day (#36)", async () => {
		await createTenant({ branding: { foundingDay: "02-21" } });
		await createAchievement("grundungstag", { isSecret: true });
		signInAs(await createUser());

		expect((await getUserAchievements()).map((a) => a.key)).toEqual([
			"grundungstag",
		]);
	});

	test("requires a signed-in member", async () => {
		await createTenant();
		await expect(getUserAchievements()).rejects.toThrow("Nicht angemeldet");
	});
});
