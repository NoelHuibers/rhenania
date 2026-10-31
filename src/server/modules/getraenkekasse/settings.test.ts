import { describe, expect, test } from "vitest";

import {
	createTenant,
	setFeature,
	setKasseConfig,
	setupTestDatabases,
	testScope,
} from "../../../../test/harness";
import { billRecipient, drinkPricing } from "./service";

setupTestDatabases();

describe("drinkPricing", () => {
	test("is off with 0 % while drinks.markup is disabled, whatever is stored", async () => {
		await createTenant();
		await setKasseConfig({ markupPercent: 25 });

		expect(await drinkPricing(testScope())).toEqual({
			enabled: false,
			markupPercent: 0,
		});
	});

	test("returns the stored markup once the feature is on", async () => {
		await createTenant({ features: ["drinks.markup"] });
		expect(await drinkPricing(testScope())).toEqual({
			enabled: true,
			markupPercent: 0,
		});

		await setKasseConfig({ markupPercent: 12.5 });
		expect(await drinkPricing(testScope())).toEqual({
			enabled: true,
			markupPercent: 12.5,
		});
	});

	test("treats an out-of-range stored markup as 0", async () => {
		await createTenant({ features: ["drinks.markup"] });
		await setKasseConfig({ markupPercent: 501 });

		expect((await drinkPricing(testScope())).markupPercent).toBe(0);
	});
});

describe("billRecipient", () => {
	test("sends to members unless the feature is on and a treasurer address is set", async () => {
		await createTenant();
		await setKasseConfig({
			billRecipient: "treasurer",
			treasurerEmail: "  kw@example.test ",
		});
		expect(await billRecipient(testScope())).toEqual({ mode: "members" });

		await setFeature("billing.treasurerRecipient", true);
		expect(await billRecipient(testScope())).toEqual({
			mode: "treasurer",
			email: "kw@example.test",
		});

		await setKasseConfig({ treasurerEmail: "   " });
		expect(await billRecipient(testScope())).toEqual({ mode: "members" });

		await setKasseConfig({
			billRecipient: "members",
			treasurerEmail: "kw@example.test",
		});
		expect(await billRecipient(testScope())).toEqual({ mode: "members" });
	});

	test("defaults to members without a config row", async () => {
		await createTenant({ features: ["billing.treasurerRecipient"] });

		expect(await billRecipient(testScope())).toEqual({ mode: "members" });
	});
});
