import { describe, expect, test, vi } from "vitest";

import { orders } from "~/server/db/schema";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import { getUserOrders } from "./getUserOrders";

setupTestDatabases();

describe("getUserOrders", () => {
	test("lists the member's personal orders, newest first", async () => {
		await createTenant();
		const member = await createUser({ name: "Max" });
		const other = await createUser();
		const drink = await createDrink({ name: "Pils" });
		const order = (
			userId: string,
			createdAt: string,
			bookingFor: string | null = null,
		) =>
			tenantDb()
				.insert(orders)
				.values({
					userId,
					userName: "x",
					drinkId: drink.id,
					drinkName: "Pils",
					amount: 2,
					pricePerUnit: 1.5,
					total: 3,
					bookingFor,
					createdAt: new Date(createdAt),
				});
		await order(member.id, "2026-10-01T10:00:00Z");
		await order(member.id, "2026-10-20T10:00:00Z");
		await order(member.id, "2026-10-21T10:00:00Z", "CC");
		await order(other.id, "2026-10-22T10:00:00Z");
		signInAs(member);

		const list = await getUserOrders();

		expect(list).toEqual([
			{
				id: expect.any(String),
				createdAt: new Date("2026-10-20T10:00:00Z"),
				drinkName: "Pils",
				amount: 2,
				total: 3,
				inBill: false,
			},
			expect.objectContaining({ createdAt: new Date("2026-10-01T10:00:00Z") }),
		]);
	});

	test("requires a signed-in member", async () => {
		await createTenant();
		vi.spyOn(console, "error").mockImplementation(() => {});

		await expect(getUserOrders()).rejects.toThrow(
			"Benutzer muss authentifiziert sein, um Bestellungen anzuzeigen",
		);
	});
});
