import { describe, expect, test } from "vitest";

import { userPreferences } from "~/server/db/schema";
import {
	getHiddenEventTypesForUser,
	getProfilePreferencesForUser,
	isEloEnabledForUser,
	isPublicProfileEnabledForUser,
} from "~/server/lib/preferences";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	getHiddenEventTypes,
	getUserPreference,
	setChallengeNotificationPreferenceAction,
	setEloPreferenceAction,
	setEmailNotificationPreferenceAction,
	setHiddenEventTypes,
	setPublicProfilePreferenceAction,
	setUserPreference,
} from "./preferences";

setupTestDatabases();

async function signedInMember() {
	await createTenant();
	const member = await createUser();
	signInAs(member);
	return member;
}

describe("generic preferences", () => {
	test("round-trips JSON values and overwrites on second save", async () => {
		await signedInMember();

		await setUserPreference("ui.density", { compact: true }, "json");
		expect(await getUserPreference("ui.density", null, "json")).toEqual({
			compact: true,
		});

		await setUserPreference("ui.density", 3, "number");
		expect(await getUserPreference("ui.density", 0, "number")).toBe(3);
		expect(await tenantDb().select().from(userPreferences)).toEqual([
			expect.objectContaining({
				key: "ui.density",
				value: "3",
				valueType: "number",
			}),
		]);
	});

	test("anonymous callers get the fallback and cannot save", async () => {
		await createTenant();

		expect(await getUserPreference("x", "fallback", "string")).toBe("fallback");
		expect(await setUserPreference("x", 1, "number")).toEqual({
			success: false,
			error: "Not authenticated",
		});
	});

	test("corrupt stored values fall back instead of throwing", async () => {
		const member = await signedInMember();
		await tenantDb().insert(userPreferences).values({
			userId: member.id,
			key: "broken",
			value: "{nope",
			valueType: "json",
		});

		expect(await getUserPreference("broken", "fallback", "json")).toBe(
			"fallback",
		);
	});

	test("preferences are per member", async () => {
		await signedInMember();
		await setUserPreference("k", "mine", "string");

		signInAs(await createUser());
		expect(await getUserPreference("k", "default", "string")).toBe("default");
	});
});

describe("boolean switches", () => {
	const switches = [
		["elo", setEloPreferenceAction],
		["publicProfile", setPublicProfilePreferenceAction],
		["challengeNotifications", setChallengeNotificationPreferenceAction],
		["email", setEmailNotificationPreferenceAction],
	] as const;

	test("default to on and can be switched off", async () => {
		const member = await signedInMember();
		expect(await getProfilePreferencesForUser(member.id)).toEqual({
			elo: true,
			publicProfile: true,
			challengeNotifications: true,
			email: true,
		});

		for (const [key, set] of switches) {
			expect(await set({ enabled: false })).toEqual({ success: true });
			expect((await getProfilePreferencesForUser(member.id))[key]).toBe(false);
		}
	});

	test("Elo and public profile can be read for another member", async () => {
		await signedInMember();
		const other = await createUser();
		expect(await isEloEnabledForUser(other.id)).toBe(true);
		expect(await isPublicProfileEnabledForUser(other.id)).toBe(true);

		signInAs(other);
		await setEloPreferenceAction({ enabled: false });
		await setPublicProfilePreferenceAction({ enabled: false });

		expect(await isEloEnabledForUser(other.id)).toBe(false);
		expect(await isPublicProfileEnabledForUser(other.id)).toBe(false);
	});

	test("only an explicit false switches Elo or the public profile off", async () => {
		const member = await signedInMember();
		await tenantDb()
			.insert(userPreferences)
			.values([
				{ userId: member.id, key: "gamification.eloEnabled", value: "0" },
				{
					userId: member.id,
					key: "privacy.publicProfileEnabled",
					value: "{bad",
				},
			]);

		expect(await isEloEnabledForUser(member.id)).toBe(true);
		expect(await isPublicProfileEnabledForUser(member.id)).toBe(true);
	});
});

describe("hidden Semesterprogramm event types", () => {
	test("stores only known event types", async () => {
		const member = await signedInMember();

		await setHiddenEventTypes(["AHV", "Kneipe" as never, "SC"]);

		expect(await getHiddenEventTypes()).toEqual(["AHV", "SC"]);
		expect(await getHiddenEventTypesForUser(member.id)).toEqual(["AHV", "SC"]);
	});

	test("ignores malformed stored values", async () => {
		const member = await signedInMember();
		expect(await getHiddenEventTypes()).toEqual([]);

		await tenantDb().insert(userPreferences).values({
			userId: member.id,
			key: "semesterprogramm.hiddenTypes",
			value: '"AHV"',
		});
		expect(await getHiddenEventTypes()).toEqual([]);
		expect(await getHiddenEventTypesForUser(member.id)).toEqual([]);
		expect(await getHiddenEventTypesForUser("unknown")).toEqual([]);
	});
});
