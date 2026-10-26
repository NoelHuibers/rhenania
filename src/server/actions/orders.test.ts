import { describe, expect, test, vi } from "vitest";

import { orders } from "~/server/db/schema";
import {
	createDrink,
	createTenant,
	createUser,
	setKasseConfig,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../test/harness";
import { createOrder } from "./orders";

// Achievements run fire-and-forget after the response; they have their own tests.
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));

setupTestDatabases();

const baseOrder = {
	drinkName: "ignored",
	amount: 2,
	pricePerUnit: 0.01,
	total: 0.02,
	bookingFor: null,
};

describe("createOrder", () => {
	test("rejects anonymous callers and writes nothing", async () => {
		await createTenant();
		const drink = await createDrink({ price: 1.5 });

		const result = await createOrder({ ...baseOrder, drinkId: drink.id });

		expect(result.success).toBe(false);
		expect(await tenantDb().select().from(orders)).toHaveLength(0);
	});

	test("books with the server-side price and ignores client prices", async () => {
		await createTenant();
		const member = await createUser({ name: "Max Muster" });
		const drink = await createDrink({ name: "Pils", price: 1.5 });
		signInAs(member);

		const result = await createOrder({ ...baseOrder, drinkId: drink.id });

		expect(result).toMatchObject({ success: true });
		const [row] = await tenantDb().select().from(orders);
		expect(row).toMatchObject({
			userId: member.id,
			userName: "Max Muster",
			drinkName: "Pils",
			amount: 2,
			pricePerUnit: 1.5,
			total: 3,
			costPerUnit: null,
			bookedByAdminId: null,
		});
	});

	test("applies the tenant markup to personal orders only", async () => {
		await createTenant({ features: ["drinks.markup"] });
		await setKasseConfig({ markupPercent: 10 });
		const member = await createUser();
		const drink = await createDrink({ price: 2 });
		signInAs(member);

		await createOrder({ ...baseOrder, drinkId: drink.id, amount: 1 });
		await createOrder({
			...baseOrder,
			drinkId: drink.id,
			amount: 1,
			bookingFor: "CC",
		});

		const rows = await tenantDb().select().from(orders);
		const personal = rows.find((r) => r.bookingFor === null);
		const event = rows.find((r) => r.bookingFor === "CC");
		expect(personal).toMatchObject({ pricePerUnit: 2.2, costPerUnit: 2 });
		expect(event?.pricePerUnit).toBe(2);
	});

	test("rejects unknown drinks and non-positive amounts", async () => {
		await createTenant();
		signInAs(await createUser());
		const drink = await createDrink();

		expect((await createOrder({ ...baseOrder, drinkId: "nope" })).success).toBe(
			false,
		);
		expect(
			(await createOrder({ ...baseOrder, drinkId: drink.id, amount: 0 }))
				.success,
		).toBe(false);
		expect(await tenantDb().select().from(orders)).toHaveLength(0);
	});

	test("only admins may book for someone else", async () => {
		await createTenant();
		const member = await createUser();
		const other = await createUser({ name: "Other" });
		const admin = await createUser({ name: "Admin", roles: ["Admin"] });
		const drink = await createDrink();
		const forOther = {
			...baseOrder,
			drinkId: drink.id,
			targetUserId: other.id,
			targetUserName: "Other",
		};

		signInAs(member);
		expect((await createOrder(forOther)).success).toBe(false);

		signInAs(admin);
		expect((await createOrder(forOther)).success).toBe(true);
		const [row] = await tenantDb().select().from(orders);
		expect(row).toMatchObject({
			userId: other.id,
			bookedByAdminId: admin.id,
			bookedByAdminName: "Admin",
		});
	});

	test("Faxe orders are always booked to AHV", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Faxe"] }));
		const drink = await createDrink();

		await createOrder({ ...baseOrder, drinkId: drink.id });

		const [row] = await tenantDb().select().from(orders);
		expect(row?.bookingFor).toBe("AHV");
	});
});
