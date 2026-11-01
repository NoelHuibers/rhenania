import { describe, expect, test } from "vitest";

import {
	createDrink,
	createTenant,
	createUser,
	setKasseConfig,
	setupTestDatabases,
	signInAs,
} from "../../../../test/harness";
import { requireTenant } from "../../../../test/state";
import {
	getAllDrinksForMenu,
	getAvailableDrinks,
	getDrinkMarkupPercent,
} from "./actions";

setupTestDatabases();

describe("drinks menu", () => {
	test("members see available drinks and the full menu", async () => {
		await createTenant();
		signInAs(await createUser());
		await createDrink({ name: "Pils", price: 1.2 });
		await createDrink({ name: "Radler", available: false });

		expect((await getAvailableDrinks()).map((d) => d.name)).toEqual(["Pils"]);
		expect((await getAllDrinksForMenu()).map((d) => d.name).sort()).toEqual([
			"Pils",
			"Radler",
		]);
	});

	test("a failed read throws instead of showing an empty menu (#216)", async () => {
		await createTenant();
		signInAs(await createUser());
		await createDrink({ name: "Pils" });
		await requireTenant().client.execute('ALTER TABLE "order" RENAME TO gone');

		await expect(getAvailableDrinks()).rejects.toThrow();
		await expect(getAllDrinksForMenu()).rejects.toThrow();
	});

	test("the markup is only reported while the feature is on", async () => {
		await createTenant();
		signInAs(await createUser());
		await setKasseConfig({ markupPercent: 10 });
		expect(await getDrinkMarkupPercent()).toBe(0);
	});

	test("with the markup feature the configured percent is reported", async () => {
		await createTenant({ features: ["drinks.markup"] });
		signInAs(await createUser());
		await setKasseConfig({ markupPercent: 10 });
		expect(await getDrinkMarkupPercent()).toBe(10);
	});
});
