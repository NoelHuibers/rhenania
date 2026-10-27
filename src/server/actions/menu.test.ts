import { describe, expect, test } from "vitest";

import {
	createDrink,
	createTenant,
	createUser,
	setKasseConfig,
	setupTestDatabases,
	signInAs,
} from "../../../test/harness";
import {
	getAllDrinksForMenu,
	getAvailableDrinks,
	getDrinkById,
	getDrinkMarkupPercent,
} from "./menu";

setupTestDatabases();

describe("drinks menu", () => {
	test("members see available drinks, the full menu and single drinks", async () => {
		await createTenant();
		signInAs(await createUser());
		const pils = await createDrink({ name: "Pils", price: 1.2 });
		await createDrink({ name: "Radler", available: false });

		expect((await getAvailableDrinks()).map((d) => d.name)).toEqual(["Pils"]);
		expect((await getAllDrinksForMenu()).map((d) => d.name).sort()).toEqual([
			"Pils",
			"Radler",
		]);
		expect(await getDrinkById(pils.id)).toMatchObject({
			name: "Pils",
			price: 1.2,
		});
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
