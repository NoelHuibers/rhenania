import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { userStats } from "~/server/db/control-schema";
import {
	achievementProgress,
	achievements,
	drinks,
	orders,
	userAchievements,
	userPreferences,
} from "~/server/db/schema";
import {
	controlDb,
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import { getUserAchievements } from "./achievements";
import { getPublicProfile } from "./public-profile";

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

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

describe("getPublicProfile", () => {
	test("shows roles, achievements, points, Elo and recent litres", async () => {
		await createTenant();
		const viewer = await createUser();
		const target = await createUser({ name: "Max", roles: ["Senior"] });
		const first = await createAchievement("first", { points: 10 });
		const rare = await createAchievement("rare", {
			points: 50,
			rarity: "rare",
		});
		const inactive = await createAchievement("old", { isActive: false });
		const unlockedAt = new Date("2026-05-01T10:00:00Z");
		await unlock(target.id, first.id, unlockedAt);
		await unlock(target.id, rare.id);
		await unlock(target.id, inactive.id);
		await unlock(viewer.id, first.id);
		await controlDb().insert(userStats).values({
			userId: target.id,
			currentElo: 1300,
			totalGames: 4,
			wins: 3,
			losses: 1,
			peakElo: 1320,
		});
		const beer = await createDrink({ name: "Pils" });
		await tenantDb()
			.update(drinks)
			.set({ volume: 0.5 })
			.where(eq(drinks.id, beer.id));
		const noVolume = await createDrink({ name: "Snack" });
		const order = (
			drinkId: string,
			amount: number,
			createdAt: Date,
			bookingFor: string | null = null,
		) =>
			tenantDb().insert(orders).values({
				userId: target.id,
				userName: "Max",
				drinkId,
				drinkName: "x",
				amount,
				pricePerUnit: 1,
				total: amount,
				createdAt,
				bookingFor,
			});
		await order(beer.id, 3, daysAgo(10));
		await order(noVolume.id, 5, daysAgo(10));
		await order(beer.id, 4, daysAgo(10), "CC");
		await order(beer.id, 10, daysAgo(240));
		signInAs(viewer);

		const profile = await getPublicProfile(target.id);

		expect(profile.status).toBe("public");
		if (profile.status !== "public") {
			return;
		}
		expect(profile.user).toEqual({
			id: target.id,
			name: "Max",
			image: null,
			roles: ["Senior"],
		});
		expect(profile.achievements).toHaveLength(2);
		expect(profile.achievements).toContainEqual({
			id: first.id,
			name: "Name first",
			description: "Beschreibung first",
			category: "drinking",
			icon: null,
			points: 10,
			rarity: "common",
			unlockedAt,
			unlockPercent: 100,
		});
		expect(profile.totalPoints).toBe(60);
		expect(profile.elo?.stats).toMatchObject({
			currentElo: 1300,
			wins: 3,
			peakElo: 1320,
		});
		expect(profile.drinkStats).toEqual({ litersLast6Months: 1.5 });
		expect(JSON.stringify(profile)).not.toContain(target.email);
	});

	test("hides Elo for members who opted out of it", async () => {
		await createTenant();
		const target = await createUser();
		await tenantDb().insert(userPreferences).values({
			userId: target.id,
			key: "gamification.eloEnabled",
			value: "false",
		});
		signInAs(await createUser());

		const profile = await getPublicProfile(target.id);

		expect(profile).toMatchObject({
			status: "public",
			elo: null,
			achievements: [],
			totalPoints: 0,
			drinkStats: { litersLast6Months: 0 },
		});
	});

	test("private profiles only reveal name and picture", async () => {
		await createTenant();
		const target = await createUser({ name: "Privat" });
		await tenantDb().insert(userPreferences).values({
			userId: target.id,
			key: "privacy.publicProfileEnabled",
			value: "false",
		});
		signInAs(await createUser());

		expect(await getPublicProfile(target.id)).toEqual({
			status: "private",
			user: { id: target.id, name: "Privat", image: null },
		});
	});

	test("unknown members are not found; anonymous callers are refused", async () => {
		await createTenant();
		const target = await createUser();
		await expect(getPublicProfile(target.id)).rejects.toThrow(
			"Nicht angemeldet",
		);

		signInAs(target);
		expect(await getPublicProfile("unknown")).toEqual({ status: "not_found" });
	});
});

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
