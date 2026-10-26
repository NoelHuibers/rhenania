import { beforeEach, describe, expect, test } from "vitest";

import { createOrderRow } from "../../../test/factories/inventory";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
} from "../../../test/harness";
import { getCurrentEventOrders, getCurrentOrders } from "./currentOrders";

setupTestDatabases();

let max: TestUser;
let moritz: TestUser;

beforeEach(async () => {
	await createTenant();
	max = await createUser({ name: "Max" });
	moritz = await createUser({ name: "Moritz" });
	signInAs(await createUser({ roles: ["Kassenwart"] }));
});

describe("getCurrentOrders", () => {
	test("groups unbilled personal orders per member and drink price", async () => {
		const pils = await createDrink({ name: "Pils", price: 1.5 });
		const cola = await createDrink({ name: "Cola", price: 2 });
		await createOrderRow({ drink: pils, user: max, amount: 2 });
		await createOrderRow({ drink: pils, user: max, amount: 1 });
		await createOrderRow({ drink: cola, user: max, amount: 1 });
		// Same drink after a price change: its own line.
		await createOrderRow({
			drink: pils,
			user: max,
			amount: 2,
			pricePerUnit: 1.75,
		});
		await createOrderRow({ drink: pils, user: moritz, amount: 4 });
		// Already billed: not current any more.
		await createOrderRow({ drink: pils, user: max, amount: 10, inBill: true });

		const entries = await getCurrentOrders();

		const maxEntry = entries.find((e) => e.id === max.id);
		expect(maxEntry).toMatchObject({ name: "Max", totalDue: 10 });
		expect(
			maxEntry?.items.map((i) => [i.name, i.quantity, i.unitPrice, i.subtotal]),
		).toEqual([
			["Pils", 3, 1.5, 4.5],
			["Cola", 1, 2, 2],
			["Pils", 2, 1.75, 3.5],
		]);
		expect(entries.find((e) => e.id === moritz.id)).toMatchObject({
			name: "Moritz",
			totalDue: 6,
			items: [{ name: "Pils", quantity: 4, subtotal: 6 }],
		});
		expect(entries).toHaveLength(2);
	});

	test("lists group bookings once per purpose, separate from the members", async () => {
		const pils = await createDrink({ name: "Pils", price: 1.5 });
		await createOrderRow({
			drink: pils,
			user: max,
			amount: 2,
			bookingFor: "CC",
		});
		await createOrderRow({
			drink: pils,
			user: moritz,
			amount: 4,
			bookingFor: "CC",
		});
		await createOrderRow({
			drink: pils,
			user: max,
			amount: 1,
			bookingFor: "AHV",
		});
		await createOrderRow({ drink: pils, user: max, amount: 1 });

		const entries = await getCurrentOrders();

		expect(entries.map((e) => [e.id, e.name, e.totalDue]).sort()).toEqual(
			[
				[max.id, "Max", 1.5],
				["event-CC", "CC", 9],
				["event-AHV", "AHV", 1.5],
			].sort(),
		);
		expect(entries.find((e) => e.id === "event-CC")?.items).toEqual([
			expect.objectContaining({ name: "Pils", quantity: 6, subtotal: 9 }),
		]);
	});

	test("is empty when everything has been billed", async () => {
		const pils = await createDrink();
		await createOrderRow({ drink: pils, user: max, inBill: true });

		expect(await getCurrentOrders()).toEqual([]);
	});

	// Three 1.10 € orders add up to 3.3000000000000003.
	test.fails("adds up amounts due in whole cents (#13)", async () => {
		const pils = await createDrink({ price: 1.1 });
		for (let i = 0; i < 3; i++) {
			await createOrderRow({ drink: pils, user: max, amount: 1 });
		}

		const [entry] = await getCurrentOrders();

		expect(entry?.totalDue).toBe(3.3);
	});
});

describe("getCurrentEventOrders", () => {
	test("returns only unbilled group bookings, with who booked first", async () => {
		const pils = await createDrink({ name: "Pils", price: 1.5 });
		const cola = await createDrink({ name: "Cola", price: 2 });
		await createOrderRow({
			drink: pils,
			user: moritz,
			amount: 2,
			bookingFor: "CC",
		});
		await createOrderRow({
			drink: cola,
			user: max,
			amount: 1,
			bookingFor: "CC",
		});
		await createOrderRow({
			drink: pils,
			user: max,
			amount: 2,
			bookingFor: "CC",
		});
		await createOrderRow({
			drink: pils,
			user: max,
			amount: 5,
			bookingFor: "CC",
			inBill: true,
		});
		await createOrderRow({ drink: pils, user: max, amount: 1 });

		expect(await getCurrentEventOrders()).toEqual([
			{
				eventName: "CC",
				bookedBy: "Moritz",
				totalAmount: 8,
				items: [
					expect.objectContaining({ name: "Pils", quantity: 4, subtotal: 6 }),
					expect.objectContaining({ name: "Cola", quantity: 1, subtotal: 2 }),
				],
			},
		]);
	});
});
