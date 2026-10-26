import { asc, desc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	inventories,
	inventoryItems,
	kostenerstattungen,
} from "~/server/db/schema";
import {
	createEtaplan,
	createEvent,
	createInventory,
	createOrderRow,
	daysAgo,
} from "../../../../test/factories/inventory";
import {
	createDrink,
	createTenant,
	createUser,
	setFeature,
	setupTestDatabases,
	signInAs,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";
import {
	cancelEventInventory,
	finishEventInventory,
	getActiveEventInventory,
	getInventoryHistory,
	getInventoryProfit,
	getStockData,
	listEtaplansWithKostenpunkte,
	listInventurEvents,
	saveInventoryCount,
	saveQuickAdjustments,
} from "./inventur";

setupTestDatabases();

let getraenkewart: TestUser;

beforeEach(async () => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	await createTenant();
	getraenkewart = await createUser({
		name: "Getränkewart",
		roles: ["Getränkewart"],
	});
	signInAs(getraenkewart);
});

async function allInventories() {
	return tenantDb()
		.select()
		.from(inventories)
		.orderBy(asc(inventories.createdAt));
}

async function itemsOf(inventoryId: string) {
	return tenantDb()
		.select()
		.from(inventoryItems)
		.where(eq(inventoryItems.inventoryId, inventoryId));
}

async function activeInventory() {
	const [row] = await tenantDb()
		.select()
		.from(inventories)
		.where(eq(inventories.status, "active"))
		.orderBy(desc(inventories.createdAt));
	return row;
}

describe("getStockData", () => {
	test("drinks never counted start at zero; unavailable drinks are hidden", async () => {
		const pils = await createDrink({ name: "Pils", price: 1.2 });
		await createDrink({ name: "Alt", available: false });

		expect(await getStockData()).toEqual([
			{
				drinkId: pils.id,
				drinkName: "Pils",
				lastInventoryStock: 0,
				purchasedSince: 0,
				soldSince: 0,
				calculatedStock: 0,
				currentPrice: 1.2,
				lastInventoryDate: null,
			},
		]);
	});

	test("expected stock = opening count + purchases − orders since the count", async () => {
		const pils = await createDrink({ name: "Pils", price: 1.2 });
		const startedAt = daysAgo(7);
		await createInventory({
			createdAt: startedAt,
			items: [{ drink: pils, countedStock: 20, purchasedSince: 24 }],
		});
		await createOrderRow({ drink: pils, amount: 3, createdAt: daysAgo(5) });
		await createOrderRow({
			drink: pils,
			amount: 2,
			bookingFor: "CC",
			createdAt: daysAgo(1),
		});
		// Before the count: already reflected in the opening stock.
		await createOrderRow({ drink: pils, amount: 50, createdAt: daysAgo(9) });

		const [row] = await getStockData();

		expect(row).toMatchObject({
			lastInventoryStock: 20,
			purchasedSince: 24,
			soldSince: 5,
			calculatedStock: 39,
			lastInventoryDate: startedAt,
		});
	});

	test("uses the latest inventory and never reports negative stock", async () => {
		const pils = await createDrink();
		await createInventory({
			status: "closed",
			createdAt: daysAgo(30),
			closedAt: daysAgo(10),
			items: [{ drink: pils, countedStock: 100 }],
		});
		await createInventory({
			createdAt: daysAgo(10),
			items: [{ drink: pils, countedStock: 2 }],
		});
		await createOrderRow({ drink: pils, amount: 5, createdAt: daysAgo(2) });

		const [row] = await getStockData();

		expect(row).toMatchObject({
			lastInventoryStock: 2,
			soldSince: 5,
			calculatedStock: 0,
		});
	});
});

describe("saveInventoryCount", () => {
	test("the first count opens a routine inventory with the counts as baseline", async () => {
		const pils = await createDrink({ name: "Pils" });
		const cola = await createDrink({ name: "Cola" });

		const result = await saveInventoryCount([
			{ drinkId: pils.id, countedStock: 48, purchasedSince: 0 },
			{ drinkId: cola.id, countedStock: -3, purchasedSince: 0 },
			{ drinkId: "deleted-drink", countedStock: 5, purchasedSince: 0 },
		]);

		expect(result).toEqual({ success: true, totalInventoryLoss: 0 });
		const [inv, ...rest] = await allInventories();
		expect(rest).toHaveLength(0);
		expect(inv).toMatchObject({
			status: "active",
			kind: "routine",
			performedBy: getraenkewart.id,
			totalLoss: 0,
			closedAt: null,
		});
		const items = await itemsOf(inv?.id ?? "");
		expect(items).toHaveLength(2);
		expect(items.find((i) => i.drinkId === pils.id)).toMatchObject({
			previousStock: 48,
			countedStock: 48,
			purchasedSince: 0,
			soldSince: 0,
			lossValue: 0,
		});
		// Negative counts are clamped to zero.
		expect(items.find((i) => i.drinkId === cola.id)?.countedStock).toBe(0);
	});

	test("closing an inventory books shortages at the purchase price and opens the next one", async () => {
		const pils = await createDrink({ name: "Pils", price: 1.5 });
		const cola = await createDrink({ name: "Cola", price: 2 });
		const running = await createInventory({
			createdAt: daysAgo(14),
			items: [
				{ drink: pils, countedStock: 20 },
				{ drink: cola, countedStock: 10 },
			],
		});
		await createOrderRow({ drink: pils, amount: 8, createdAt: daysAgo(7) });
		await createOrderRow({ drink: cola, amount: 4, createdAt: daysAgo(3) });
		await createOrderRow({ drink: pils, amount: 99, createdAt: daysAgo(20) });

		// Pils: 20 + 24 − 8 = 36 expected, 33 counted → 3 missing × 1.50 €.
		// Cola: 10 + 0 − 4 = 6 expected, 8 counted → surplus, no loss.
		const result = await saveInventoryCount([
			{ drinkId: pils.id, countedStock: 33, purchasedSince: 24 },
			{ drinkId: cola.id, countedStock: 8, purchasedSince: 0 },
		]);

		expect(result).toEqual({ success: true, totalInventoryLoss: 4.5 });

		const [closed, next] = await allInventories();
		expect(closed).toMatchObject({
			id: running.id,
			status: "closed",
			totalLoss: 4.5,
		});
		expect(closed?.closedAt).toBeInstanceOf(Date);

		const closedItems = await itemsOf(running.id);
		expect(closedItems.find((i) => i.drinkId === pils.id)).toMatchObject({
			previousStock: 20,
			countedStock: 33,
			purchasedSince: 24,
			soldSince: 8,
			lossValue: 4.5,
		});
		expect(closedItems.find((i) => i.drinkId === cola.id)).toMatchObject({
			countedStock: 8,
			soldSince: 4,
			lossValue: 0,
		});

		expect(next).toMatchObject({ status: "active", kind: "routine" });
		const nextItems = await itemsOf(next?.id ?? "");
		expect(
			nextItems
				.map((i) => [i.drinkId, i.previousStock, i.countedStock, i.lossValue])
				.sort(),
		).toEqual(
			[
				[cola.id, 8, 8, 0],
				[pils.id, 33, 33, 0],
			].sort(),
		);
	});

	test("a drink added mid-period takes its baseline from its last count", async () => {
		const kolsch = await createDrink({ name: "Kölsch", price: 2 });
		await createInventory({
			status: "closed",
			createdAt: daysAgo(60),
			closedAt: daysAgo(30),
			items: [{ drink: kolsch, countedStock: 10 }],
		});
		const running = await createInventory({ createdAt: daysAgo(30) });
		await createOrderRow({ drink: kolsch, amount: 1, createdAt: daysAgo(5) });

		const result = await saveInventoryCount([
			{ drinkId: kolsch.id, countedStock: 7, purchasedSince: 0 },
		]);

		// 10 − 1 = 9 expected, 7 counted → 2 × 2 €.
		expect(result).toEqual({ success: true, totalInventoryLoss: 4 });
		expect(await itemsOf(running.id)).toEqual([
			expect.objectContaining({
				previousStock: 10,
				countedStock: 7,
				soldSince: 1,
				lossValue: 4,
			}),
		]);
	});

	test("startEvent opens the next inventory as a Veranstaltungs-Inventur", async () => {
		const pils = await createDrink();
		const event = await createEvent({
			title: "Stiftungsfest",
			date: new Date("2026-11-07T18:00:00Z"),
		});

		await saveInventoryCount(
			[{ drinkId: pils.id, countedStock: 30, purchasedSince: 0 }],
			{
				startEvent: {
					eventId: event.id,
					eventName: "Stiftungsfest",
					eventDate: event.date,
				},
			},
		);

		expect(await getActiveEventInventory()).toMatchObject({
			eventName: "Stiftungsfest",
			eventDate: event.date,
		});
		expect(await activeInventory()).toMatchObject({
			kind: "event",
			eventId: event.id,
		});
	});

	test("a failing item rolls back the whole count", async () => {
		const pils = await createDrink({ price: 1 });
		const cola = await createDrink({ price: 1 });
		const running = await createInventory({
			createdAt: daysAgo(7),
			items: [
				{ drink: pils, countedStock: 10 },
				{ drink: cola, countedStock: 10 },
			],
		});

		const result = await saveInventoryCount([
			{ drinkId: pils.id, countedStock: 5, purchasedSince: 0 },
			// NaN survives Math.max and violates the NOT NULL column.
			{ drinkId: cola.id, countedStock: Number.NaN, purchasedSince: 0 },
		]);

		expect(result.success).toBe(false);
		expect(await allInventories()).toEqual([
			expect.objectContaining({ id: running.id, status: "active" }),
		]);
		expect(
			(await itemsOf(running.id)).map((i) => [i.countedStock, i.lossValue]),
		).toEqual([
			[10, 0],
			[10, 0],
		]);
	});

	// Loss = 3 × 1.10 € is 3.3000000000000003 in floating point.
	test("stores losses rounded to whole cents (#13)", async () => {
		const pils = await createDrink({ price: 1.1 });
		await createInventory({
			createdAt: daysAgo(7),
			items: [{ drink: pils, countedStock: 10 }],
		});

		const result = await saveInventoryCount([
			{ drinkId: pils.id, countedStock: 7, purchasedSince: 0 },
		]);

		expect(result.totalInventoryLoss).toBe(3.3);
		const [closed] = await allInventories();
		expect(closed?.totalLoss).toBe(3.3);
	});
});

describe("saveQuickAdjustments", () => {
	test("updates only the given fields of the running inventory and clamps negatives", async () => {
		const pils = await createDrink();
		const cola = await createDrink();
		const mate = await createDrink();
		const running = await createInventory({
			createdAt: daysAgo(3),
			items: [
				{ drink: pils, countedStock: 10, purchasedSince: 2 },
				{ drink: cola, countedStock: 5, purchasedSince: 0 },
				{ drink: mate, countedStock: 7, purchasedSince: 1 },
			],
		});

		const result = await saveQuickAdjustments([
			{ drinkId: pils.id, purchasedQuantity: 24 },
			{ drinkId: cola.id, countedStock: -4, purchasedQuantity: 6 },
			{ drinkId: mate.id },
		]);

		expect(result).toEqual({ success: true });
		const byDrink = new Map(
			(await itemsOf(running.id)).map((i) => [
				i.drinkId,
				[i.previousStock, i.countedStock, i.purchasedSince],
			]),
		);
		expect(byDrink.get(pils.id)).toEqual([10, 10, 24]);
		expect(byDrink.get(cola.id)).toEqual([5, 0, 6]);
		expect(byDrink.get(mate.id)).toEqual([7, 7, 1]);
		expect(await allInventories()).toHaveLength(1);
	});

	test("adds drinks missing from the running inventory and ignores unknown ones", async () => {
		const pils = await createDrink({ price: 1.3 });
		const running = await createInventory({ createdAt: daysAgo(3) });

		const result = await saveQuickAdjustments([
			{ drinkId: pils.id, purchasedQuantity: 20 },
			{ drinkId: "deleted-drink", countedStock: 4 },
		]);

		expect(result).toEqual({ success: true });
		expect(await itemsOf(running.id)).toEqual([
			expect.objectContaining({
				drinkId: pils.id,
				previousStock: 0,
				countedStock: 0,
				purchasedSince: 20,
				priceAtCount: 1.3,
			}),
		]);
	});

	test("starts an inventory when none is running and keeps the adjustment (#18)", async () => {
		const pils = await createDrink();
		await createInventory({
			status: "closed",
			createdAt: daysAgo(30),
			closedAt: daysAgo(10),
			items: [{ drink: pils, countedStock: 12 }],
		});

		const result = await saveQuickAdjustments([
			{ drinkId: pils.id, purchasedQuantity: 24 },
		]);

		expect(result).toEqual({ success: true });
		const running = await activeInventory();
		expect(running).toBeDefined();
		expect(await itemsOf(running?.id ?? "")).toEqual([
			expect.objectContaining({ previousStock: 12, purchasedSince: 24 }),
		]);
	});

	test("a new inventory's baseline is the last count minus later sales; uncounted drinks start at 0", async () => {
		const pils = await createDrink({ name: "Pils", price: 1.4 });
		const cola = await createDrink({ name: "Cola" });
		const neu = await createDrink({ name: "Neu" });
		await createInventory({
			status: "closed",
			createdAt: daysAgo(60),
			closedAt: daysAgo(40),
			items: [{ drink: pils, countedStock: 99 }],
		});
		await createInventory({
			status: "closed",
			createdAt: daysAgo(40),
			closedAt: daysAgo(10),
			items: [
				{ drink: pils, countedStock: 12 },
				{ drink: cola, countedStock: 3 },
			],
		});
		// Before the count: already reflected in it.
		await createOrderRow({ drink: pils, amount: 7, createdAt: daysAgo(20) });
		// After the count.
		await createOrderRow({ drink: pils, amount: 5, createdAt: daysAgo(4) });
		await createOrderRow({ drink: cola, amount: 9, createdAt: daysAgo(2) });

		const result = await saveQuickAdjustments([
			{ drinkId: cola.id, countedStock: 1 },
		]);

		expect(result).toEqual({ success: true });
		const running = await activeInventory();
		expect(running).toMatchObject({
			kind: "routine",
			performedBy: getraenkewart.id,
		});
		const byDrink = new Map(
			(await itemsOf(running?.id ?? "")).map((i) => [
				i.drinkId,
				[i.previousStock, i.countedStock, i.priceAtCount],
			]),
		);
		expect(byDrink.get(pils.id)).toEqual([7, 7, 1.4]);
		// 3 − 9 is clamped to 0; the counted 1 is kept.
		expect(byDrink.get(cola.id)?.slice(0, 2)).toEqual([0, 1]);
		expect(byDrink.get(neu.id)?.slice(0, 2)).toEqual([0, 0]);
		expect(await allInventories()).toHaveLength(3);
	});
});

describe("getInventoryHistory", () => {
	test("lists the last ten closed inventories, newest first, with derived differences", async () => {
		// One clock for seeding and assertions: recomputing "now" later can
		// cross a second boundary and shift every derived timestamp.
		const now = Date.now();
		const pils = await createDrink({ name: "Pils" });
		for (let i = 12; i >= 1; i--) {
			await createInventory({
				status: "closed",
				createdAt: daysAgo(i * 10 + 10, now),
				closedAt: daysAgo(i * 10, now),
				totalLoss: i,
				items: [
					{
						drink: pils,
						previousStock: 10,
						purchasedSince: 5,
						soldSince: 20,
						countedStock: i,
					},
				],
			});
		}
		await createInventory({ createdAt: daysAgo(10, now) });

		const history = await getInventoryHistory();

		expect(history.map((h) => h.totalLosses)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
		]);
		expect(history[0]).toMatchObject({
			status: "closed",
			kind: "routine",
			inventoryDate: daysAgo(10, now),
			profit: null,
			// 10 + 5 − 20 is clamped to an expected stock of 0.
			items: [
				{
					drinkId: pils.id,
					drinkName: "Pils",
					countedStock: 1,
					expectedStock: 0,
					difference: 1,
				},
			],
		});
	});

	test("reports each period's markup profit when the feature is on", async () => {
		await setFeature("drinks.markup", true);
		const pils = await createDrink({ price: 1 });
		const start = daysAgo(20);
		const end = daysAgo(10);
		await createInventory({
			status: "closed",
			createdAt: start,
			closedAt: end,
		});
		const order = { drink: pils, pricePerUnit: 1.2, costPerUnit: 1 };
		await createOrderRow({ ...order, amount: 2, createdAt: start });
		await createOrderRow({ ...order, amount: 3, createdAt: daysAgo(15) });
		await createOrderRow({ ...order, amount: 100, createdAt: end });
		await createOrderRow({ ...order, amount: 100, createdAt: daysAgo(25) });
		// Orders before the feature carry no cost price and no profit.
		await createOrderRow({ drink: pils, amount: 100, createdAt: daysAgo(15) });

		const [period] = await getInventoryHistory();

		expect(period?.profit).toBe(1);
	});
});

describe("getInventoryProfit", () => {
	test("is null without the markup feature", async () => {
		const pils = await createDrink();
		await createOrderRow({ drink: pils, pricePerUnit: 2, costPerUnit: 1 });

		expect(await getInventoryProfit()).toBeNull();
	});

	test("sums the markup since the running inventory started, rounded to cents", async () => {
		await setFeature("drinks.markup", true);
		const mate = await createDrink({ price: 0.69 });
		const order = { drink: mate, pricePerUnit: 0.76, costPerUnit: 0.69 };

		// No inventory yet: everything counts.
		await createOrderRow({ ...order, amount: 1, createdAt: daysAgo(40) });
		expect(await getInventoryProfit()).toBe(0.07);

		await createInventory({ createdAt: daysAgo(30) });
		await createOrderRow({ ...order, amount: 3, createdAt: daysAgo(2) });
		// 3 × 0.07 = 0.21000000000000002 before rounding.
		expect(await getInventoryProfit()).toBe(0.21);
	});
});

describe("Veranstaltungs-Inventur", () => {
	async function startEventInventory(
		drinks: Array<{
			drink: { id: string; name: string; price: number };
			count: number;
		}>,
		eventDate: Date | null = new Date("2026-11-07T18:00:00Z"),
	) {
		return createInventory({
			kind: "event",
			eventName: "Stiftungsfest",
			eventDate,
			createdAt: daysAgo(2),
			items: drinks.map(({ drink, count }) => ({ drink, countedStock: count })),
		});
	}

	test("cancelling keeps the inventory running as a routine one", async () => {
		const pils = await createDrink();
		const running = await startEventInventory([{ drink: pils, count: 10 }]);

		expect(await cancelEventInventory()).toEqual({ success: true });

		expect(await getActiveEventInventory()).toBeNull();
		expect(await activeInventory()).toMatchObject({
			id: running.id,
			status: "active",
			kind: "routine",
			eventName: null,
			eventDate: null,
		});
		expect(await itemsOf(running.id)).toHaveLength(1);
	});

	test("finishing reports unbooked consumption and opens a routine inventory", async () => {
		const pils = await createDrink({ name: "Pils", price: 1.1 });
		const cola = await createDrink({ name: "Cola", price: 2 });
		const wasser = await createDrink({ name: "Wasser", price: 0.5 });
		const running = await startEventInventory([
			{ drink: pils, count: 24 },
			{ drink: cola, count: 10 },
		]);
		await createOrderRow({ drink: pils, amount: 4, createdAt: daysAgo(1) });

		const result = await finishEventInventory([
			// 24 + 6 − 4 = 26 expected → 6 drunk without being booked.
			{ drinkId: pils.id, countedStock: 20, purchasedSince: 6 },
			// Nothing missing.
			{ drinkId: cola.id, countedStock: 10, purchasedSince: 0 },
			// Not in the event inventory: baseline 0, nothing to report.
			{ drinkId: wasser.id, countedStock: 12, purchasedSince: 12 },
		]);

		expect(result).toEqual({
			success: true,
			report: {
				eventName: "Stiftungsfest",
				eventDate: new Date("2026-11-07T18:00:00Z"),
				// 6 × 1.10 € = 6.6000000000000005 before rounding.
				items: [{ drinkName: "Pils", consumed: 6, value: 6.6 }],
				totalQty: 6,
				totalValue: 6.6,
				booked: false,
			},
		});

		const [closed, next] = await allInventories();
		expect(closed).toMatchObject({
			id: running.id,
			status: "closed",
			totalLoss: 6.6,
		});
		expect(
			(await itemsOf(running.id)).find((i) => i.drinkId === pils.id),
		).toMatchObject({ countedStock: 20, soldSince: 4, lossValue: 6.6 });
		expect(next).toMatchObject({ status: "active", kind: "routine" });
		expect(
			(await itemsOf(next?.id ?? ""))
				.map((i) => [i.drinkId, i.previousStock])
				.sort(),
		).toEqual(
			[
				[pils.id, 20],
				[cola.id, 10],
				[wasser.id, 12],
			].sort(),
		);
	});

	test("books the consumption to the chosen Kostenpunkt in the CC-Kasse", async () => {
		const pils = await createDrink({ price: 1.5 });
		const eventDate = new Date("2026-11-07T18:00:00Z");
		await startEventInventory([{ drink: pils, count: 30 }], eventDate);
		const { plan, kostenpunkte } = await createEtaplan({
			kostenpunkte: [{ name: "Stiftungsfest" }],
		});

		const result = await finishEventInventory(
			[{ drinkId: pils.id, countedStock: 18, purchasedSince: 0 }],
			{ kostenpunktId: kostenpunkte[0]?.id },
		);

		expect(result).toMatchObject({
			success: true,
			report: { totalValue: 18, booked: true },
		});
		expect(await tenantDb().select().from(kostenerstattungen)).toEqual([
			expect.objectContaining({
				kostenpunktId: kostenpunkte[0]?.id,
				etaplanId: plan.id,
				source: "Direktbuchung",
				status: "Ausgezahlt",
				amount: 18,
				description: "Getränkeverbrauch – Stiftungsfest",
				recipientName: "Getränkekasse",
				expenseDate: eventDate,
				paidAt: eventDate,
				paidBy: getraenkewart.id,
				approvedBy: getraenkewart.id,
			}),
		]);
	});

	test("books nothing when nothing was consumed or the Kostenpunkt is gone", async () => {
		const pils = await createDrink({ price: 1.5 });
		const { kostenpunkte } = await createEtaplan({
			kostenpunkte: [{ name: "Kneipe" }],
		});

		await startEventInventory([{ drink: pils, count: 10 }]);
		const nothingDrunk = await finishEventInventory(
			[{ drinkId: pils.id, countedStock: 10, purchasedSince: 0 }],
			{ kostenpunktId: kostenpunkte[0]?.id },
		);
		expect(nothingDrunk).toMatchObject({
			success: true,
			report: { totalValue: 0, booked: false, items: [] },
		});

		await tenantDb()
			.update(inventories)
			.set({ kind: "event", eventName: "Kneipe" })
			.where(eq(inventories.status, "active"));
		const unknownKp = await finishEventInventory(
			[{ drinkId: pils.id, countedStock: 4, purchasedSince: 0 }],
			{ kostenpunktId: "deleted-kostenpunkt" },
		);
		expect(unknownKp).toMatchObject({
			success: true,
			report: { totalValue: 9, booked: false },
		});

		expect(await tenantDb().select().from(kostenerstattungen)).toHaveLength(0);
	});

	test("refuses to finish without a running Veranstaltungs-Inventur", async () => {
		const pils = await createDrink();
		const item = { drinkId: pils.id, countedStock: 1, purchasedSince: 0 };

		expect(await finishEventInventory([item])).toEqual({
			success: false,
			error: "Keine aktive Inventur vorhanden",
		});

		const routine = await createInventory({ createdAt: daysAgo(1) });
		expect(await finishEventInventory([item])).toEqual({
			success: false,
			error: "Die aktive Inventur ist keine Veranstaltung",
		});
		expect(await allInventories()).toEqual([
			expect.objectContaining({ id: routine.id, status: "active" }),
		]);
	});
});

describe("pickers for the Veranstaltungs-Inventur", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	test("lists events from the last 60 days and the future, newest first", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
		const day = 86_400_000;
		const now = Date.now();
		await createEvent({ title: "zu alt", date: new Date(now - 61 * day) });
		await createEvent({
			title: "Antrittskneipe",
			date: new Date(now - 59 * day),
		});
		await createEvent({
			title: "Stiftungsfest",
			date: new Date(now + 12 * day),
		});
		await createEvent({ title: "Kneipe", date: new Date(now - day) });

		const titles = (await listInventurEvents()).map((e) => e.title);

		expect(titles).toEqual(["Stiftungsfest", "Kneipe", "Antrittskneipe"]);
	});

	test("groups Kostenpunkte under their Etaplan, newest plan first", async () => {
		const older = await createEtaplan({
			name: "SS 2026",
			createdAt: daysAgo(200),
			kostenpunkte: [{ name: "Maibowle" }],
		});
		const newer = await createEtaplan({
			name: "WS 2026/27",
			createdAt: daysAgo(10),
			kostenpunkte: [
				{ name: "Stiftungsfest", category: "Feste" },
				{ name: "Kneipe" },
			],
		});
		await createEtaplan({ name: "leer", createdAt: daysAgo(400) });

		const plans = await listEtaplansWithKostenpunkte();

		expect(
			plans.map((p) => [p.name, p.kostenpunkte.map((k) => k.name).sort()]),
		).toEqual([
			["WS 2026/27", ["Kneipe", "Stiftungsfest"]],
			["SS 2026", ["Maibowle"]],
			["leer", []],
		]);
		expect(plans[0]?.id).toBe(newer.plan.id);
		expect(plans[1]?.kostenpunkte[0]?.etaplanId).toBe(older.plan.id);
	});
});
