import { describe, expect, test } from "vitest";

import {
	createTenant,
	setFeature,
	setKasseConfig,
	setupTestDatabases,
} from "../../../test/harness";
import { getBillRecipient, getDrinkPricingConfig } from "./getraenke-settings";

setupTestDatabases();

describe("getDrinkPricingConfig", () => {
	test("is off with 0 % while drinks.markup is disabled, whatever is stored", async () => {
		await createTenant();
		await setKasseConfig({ markupPercent: 25 });

		expect(await getDrinkPricingConfig()).toEqual({
			enabled: false,
			markupPercent: 0,
		});
	});

	test("returns the stored markup once the feature is on", async () => {
		await createTenant({ features: ["drinks.markup"] });
		expect(await getDrinkPricingConfig()).toEqual({
			enabled: true,
			markupPercent: 0,
		});

		await setKasseConfig({ markupPercent: 12.5 });
		expect(await getDrinkPricingConfig()).toEqual({
			enabled: true,
			markupPercent: 12.5,
		});
	});

	test("treats an out-of-range stored markup as 0", async () => {
		await createTenant({ features: ["drinks.markup"] });
		await setKasseConfig({ markupPercent: 501 });

		expect((await getDrinkPricingConfig()).markupPercent).toBe(0);
	});
});

describe("getBillRecipient", () => {
	test("sends to members unless the feature is on and a treasurer address is set", async () => {
		await createTenant();
		await setKasseConfig({
			billRecipient: "treasurer",
			treasurerEmail: "  kw@example.test ",
		});
		expect(await getBillRecipient()).toEqual({ mode: "members" });

		await setFeature("billing.treasurerRecipient", true);
		expect(await getBillRecipient()).toEqual({
			mode: "treasurer",
			email: "kw@example.test",
		});

		await setKasseConfig({ treasurerEmail: "   " });
		expect(await getBillRecipient()).toEqual({ mode: "members" });

		await setKasseConfig({
			billRecipient: "members",
			treasurerEmail: "kw@example.test",
		});
		expect(await getBillRecipient()).toEqual({ mode: "members" });
	});

	test("defaults to members without a config row", async () => {
		await createTenant({ features: ["billing.treasurerRecipient"] });

		expect(await getBillRecipient()).toEqual({ mode: "members" });
	});
});
