import { describe, expect, test } from "vitest";

import { createOrderRow, daysAgo } from "../../../test/factories/inventory";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
} from "../../../test/harness";
import { getRecentDrinkIds } from "./recent-drinks";

setupTestDatabases();

describe("getRecentDrinkIds", () => {
	test("the member's most ordered available drinks of the last 30 days", async () => {
		await createTenant();
		const max = await createUser({ name: "Max" });
		const moritz = await createUser({ name: "Moritz" });
		const pils = await createDrink({ name: "Pils" });
		const weizen = await createDrink({ name: "Weizen" });
		const spezi = await createDrink({ name: "Spezi" });
		const wasser = await createDrink({ name: "Wasser" });
		const cola = await createDrink({ name: "Cola" });
		const radler = await createDrink({ name: "Radler", available: false });
		const mate = await createDrink({ name: "Mate" });

		await createOrderRow({ drink: pils, user: max, amount: 2 });
		await createOrderRow({ drink: pils, user: max, amount: 3 });
		await createOrderRow({ drink: weizen, user: max, amount: 4 });
		await createOrderRow({ drink: spezi, user: max, amount: 1 });
		await createOrderRow({
			drink: wasser,
			user: max,
			amount: 1,
			createdAt: daysAgo(1),
		});
		await createOrderRow({ drink: cola, user: max, amount: 1, inBill: true });
		// Not counted: unavailable, too old, somebody else's.
		await createOrderRow({ drink: radler, user: max, amount: 50 });
		await createOrderRow({
			drink: mate,
			user: max,
			amount: 50,
			createdAt: daysAgo(31),
		});
		await createOrderRow({ drink: mate, user: moritz, amount: 50 });

		const ids = await getRecentDrinkIds(max.id);

		// Ties (1 each) go to the most recently ordered; limit 4.
		expect(ids).toHaveLength(4);
		expect(ids.slice(0, 2)).toEqual([pils.id, weizen.id]);
		expect(ids).not.toContain(radler.id);
		expect(ids).not.toContain(mate.id);
		expect(ids).not.toContain(wasser.id);
	});

	test("nothing for a member without orders", async () => {
		await createTenant();
		const max = await createUser();
		await createDrink();
		expect(await getRecentDrinkIds(max.id)).toEqual([]);
	});

	test("window and limit are adjustable", async () => {
		await createTenant();
		const max = await createUser();
		const pils = await createDrink({ name: "Pils" });
		const weizen = await createDrink({ name: "Weizen" });
		await createOrderRow({
			drink: pils,
			user: max,
			amount: 5,
			createdAt: daysAgo(10),
		});
		await createOrderRow({ drink: weizen, user: max, amount: 1 });

		expect(await getRecentDrinkIds(max.id, { days: 5 })).toEqual([weizen.id]);
		expect(await getRecentDrinkIds(max.id, { limit: 1 })).toEqual([pils.id]);
	});
});
