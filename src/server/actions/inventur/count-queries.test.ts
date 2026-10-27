// Query budget of saving an inventory count (#25): the reads no longer
// repeat per drink.

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import { inventories, inventoryItems } from "~/server/db/schema";
import {
	createInventory,
	createOrderRow,
	daysAgo,
} from "../../../../test/factories/inventory";
import {
	countQueries,
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import { getInventoryHistory, saveInventoryCount } from "./inventur";

setupTestDatabases();

beforeEach(async () => {
	await createTenant();
	signInAs(await createUser({ roles: ["Getränkewart"] }));
});

async function countSave(drinkCount: number) {
	const stock: Awaited<ReturnType<typeof createDrink>>[] = [];
	for (let i = 0; i < drinkCount; i++) {
		const drink = await createDrink({ price: 1 });
		await createOrderRow({ drink, amount: 1, createdAt: daysAgo(1) });
		stock.push(drink);
	}
	await createInventory({
		createdAt: daysAgo(5),
		items: stock.map((drink) => ({ drink, countedStock: 10 })),
	});
	return countQueries(() =>
		saveInventoryCount(
			stock.map((drink) => ({
				drinkId: drink.id,
				countedStock: 8,
				purchasedSince: 0,
			})),
		),
	);
}

describe("saveInventoryCount query budget (#25)", () => {
	test("reads drinks and sales once, not per drink (was 41 round trips)", async () => {
		const counted = await countSave(5);

		expect(counted.result).toEqual({
			ok: true,
			data: { totalInventoryLoss: 5 },
		});
		// Role guard (2), then one transaction: 4 reads, an UPDATE per counted
		// drink, close, open, one insert of all opening items, commit. The
		// guard's session is reused, so no second auth() (was 2 + 2 + …).
		expect(counted.total).toBe(2 + 4 + 5 + 4);
		const items = await tenantDb().select().from(inventoryItems);
		// Five closed items with a loss of 1 each, five opening items of 8.
		expect(items.filter((i) => i.lossValue === 1)).toHaveLength(5);
		expect(
			items.filter((i) => i.previousStock === 8 && i.countedStock === 8),
		).toHaveLength(5);
		expect(await tenantDb().select().from(inventories)).toHaveLength(2);
	});

	test("unknown drinks are skipped; a drink new to the running inventory starts from its last count", async () => {
		const pils = await createDrink({ price: 1 });
		await createInventory({
			status: "closed",
			createdAt: daysAgo(20),
			closedAt: daysAgo(10),
			items: [{ drink: pils, countedStock: 10 }],
		});
		const running = await createInventory({ createdAt: daysAgo(10) });

		const result = await saveInventoryCount([
			{ drinkId: "gone", countedStock: 3, purchasedSince: 0 },
			{ drinkId: pils.id, countedStock: 7, purchasedSince: 0 },
		]);

		expect(result).toEqual({ ok: true, data: { totalInventoryLoss: 3 } });
		const closed = await tenantDb()
			.select()
			.from(inventoryItems)
			.where(eq(inventoryItems.inventoryId, running.id));
		expect(closed).toEqual([
			expect.objectContaining({
				drinkId: pils.id,
				previousStock: 10,
				countedStock: 7,
				lossValue: 3,
			}),
		]);
	});

	test("an empty count closes the running inventory and opens an empty one", async () => {
		await createInventory({ createdAt: daysAgo(10) });

		expect(await saveInventoryCount([])).toEqual({
			ok: true,
			data: { totalInventoryLoss: 0 },
		});
		expect(await tenantDb().select().from(inventoryItems)).toEqual([]);
		expect(await getInventoryHistory()).toHaveLength(1);
	});

	test("history is empty before the first closed inventory", async () => {
		expect(await getInventoryHistory()).toEqual([]);
	});
});
