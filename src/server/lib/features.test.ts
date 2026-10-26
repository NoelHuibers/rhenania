import { describe, expect, test } from "vitest";

import { defaultFeatureFlags } from "~/lib/features";
import {
	createTenant,
	setFeature,
	setupTestDatabases,
} from "../../../test/harness";
import {
	FeatureDisabledError,
	getFeatureFlags,
	hasFeature,
	requireFeature,
} from "./features";

setupTestDatabases();

describe("server feature flags", () => {
	test("every flag is off without a tenant in the request", async () => {
		expect(await getFeatureFlags()).toEqual(defaultFeatureFlags());
		expect(await hasFeature("drinks.markup")).toBe(false);
	});

	test("reads the current tenant's flags only", async () => {
		await createTenant({ features: ["billing.markAllPaid"] });
		await createTenant({ features: ["drinks.markup"] });

		expect(await hasFeature("billing.markAllPaid")).toBe(true);
		expect(await hasFeature("drinks.markup")).toBe(false);
	});

	test("requireFeature throws a German error naming the feature", async () => {
		await createTenant();

		const error = await requireFeature("drinks.markup").catch((e) => e);

		expect(error).toBeInstanceOf(FeatureDisabledError);
		expect(error.name).toBe("FeatureDisabledError");
		expect(error.message).toBe(
			'Die Funktion „Preisaufschlag" ist nicht freigeschaltet.',
		);
	});

	test("a flag switched on is enforced on the next request", async () => {
		await createTenant();
		await expect(
			requireFeature("billing.treasurerRecipient"),
		).rejects.toThrow();

		await setFeature("billing.treasurerRecipient", true);
		await expect(
			requireFeature("billing.treasurerRecipient"),
		).resolves.toBeUndefined();

		await setFeature("billing.treasurerRecipient", false);
		expect(await hasFeature("billing.treasurerRecipient")).toBe(false);
	});
});
