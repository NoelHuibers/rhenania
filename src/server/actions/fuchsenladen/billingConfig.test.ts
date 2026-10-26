import { describe, expect, test } from "vitest";

import { fuchsenBillingConfig } from "~/server/db/schema";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	type FuchsenBillingConfigInput,
	getFuchsenBillingConfig,
	updateFuchsenBillingConfig,
} from "./billingConfig";

setupTestDatabases();

const input: FuchsenBillingConfigInput = {
	senderName: "Fuchsenwart Corps Test",
	senderStreet: "Hauptstr. 1",
	senderCity: "70174 Stuttgart",
	location: "Stuttgart",
	iban: "DE89370400440532013000",
	accountHolder: "Max Fux",
	paypalBaseUrl: "https://paypal.me/maxfux/",
	paymentDueDays: 21,
};

describe("getFuchsenBillingConfig", () => {
	test("falls back to an empty config with a 14 day due date", async () => {
		await createTenant();

		expect(await getFuchsenBillingConfig()).toMatchObject({
			id: "singleton",
			iban: "",
			paypalBaseUrl: "",
			paymentDueDays: 14,
		});
	});
});

describe("updateFuchsenBillingConfig", () => {
	test("saves and later overwrites the singleton config", async () => {
		await createTenant();
		const fuchs = await createUser({ roles: ["Fuchs"] });
		signInAs(fuchs);

		expect(await updateFuchsenBillingConfig(input)).toMatchObject({
			success: true,
		});
		await updateFuchsenBillingConfig({ ...input, paymentDueDays: 7 });

		expect(await tenantDb().select().from(fuchsenBillingConfig)).toHaveLength(
			1,
		);
		expect(await getFuchsenBillingConfig()).toMatchObject({
			...input,
			paymentDueDays: 7,
			updatedBy: fuchs.id,
		});
	});

	test.each([
		[{ paypalBaseUrl: "paypal.me/maxfux" }, "PayPal-Link"],
		[{ paymentDueDays: 0 }, ""],
		[{ paymentDueDays: 91 }, ""],
	])("rejects invalid input %o", async (patch, message) => {
		await createTenant();
		signInAs(await createUser({ roles: ["Admin"] }));

		const result = await updateFuchsenBillingConfig({ ...input, ...patch });

		expect(result.success).toBe(false);
		expect(result.error).toContain(message);
		expect(await tenantDb().select().from(fuchsenBillingConfig)).toHaveLength(
			0,
		);
	});

	test("is refused for members without the Fuchs or Admin role", async () => {
		await createTenant();
		signInAs(await createUser());

		expect(await updateFuchsenBillingConfig(input)).toEqual({
			success: false,
			error: "Keine Berechtigung",
		});
		expect(await tenantDb().select().from(fuchsenBillingConfig)).toHaveLength(
			0,
		);
	});
});
