import { describe, expect, test, vi } from "vitest";

import { checkAndUnlockAchievements } from "~/server/actions/achievements/tracking";
import { orders } from "~/server/db/schema";
import { createOrderRow, daysAgo } from "../../../test/factories/inventory";
import {
	countQueries,
	createDrink,
	createTenant,
	createUser,
	flushAfter,
	setKasseConfig,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../test/harness";
import { testState } from "../../../test/state";
import { createOrder, getMyOrdersPage } from "./orders";

// Achievements run after the response; they have their own tests.
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

	test("tracks achievements after the response, for this Corps (#22)", async () => {
		const tenant = await createTenant();
		const member = await createUser();
		const drink = await createDrink({ name: "Pils", price: 1.5 });
		signInAs(member);

		await createOrder({ ...baseOrder, drinkId: drink.id });

		expect(testState.afterTasks).toHaveLength(1);
		await flushAfter();
		expect(checkAndUnlockAchievements).toHaveBeenCalledWith(
			member.id,
			"order_created",
			{
				drinkName: "Pils",
				drinkId: drink.id,
				amount: 2,
				total: 3,
				bookingFor: null,
			},
			{ tenantId: tenant.id },
		);
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

describe("getMyOrdersPage (#24)", () => {
	test("returns only the caller's own orders, newest first", async () => {
		await createTenant();
		const member = await createUser({ name: "Max" });
		const other = await createUser({ name: "Moritz" });
		const drink = await createDrink({ name: "Pils" });
		await createOrderRow({
			drink,
			user: member,
			amount: 2,
			createdAt: daysAgo(1),
		});
		await createOrderRow({
			drink,
			user: other,
			amount: 9,
			createdAt: daysAgo(2),
		});
		await createOrderRow({
			drink,
			user: member,
			amount: 1,
			createdAt: daysAgo(3),
		});
		// Booked for Max by an admin: it is still Max's order.
		await createOrderRow({
			drink,
			user: member,
			amount: 4,
			bookedByAdminName: "Admin",
			createdAt: daysAgo(2),
		});
		signInAs(member);

		const result = await getMyOrdersPage();

		expect(result.total).toBe(3);
		expect(result.orders.map((o) => o.amount)).toEqual([2, 4, 1]);
	});

	test("loads one page at a time, with the total across pages", async () => {
		await createTenant();
		const member = await createUser();
		const drink = await createDrink({ name: "Pils" });
		for (let i = 1; i <= 12; i++) {
			await createOrderRow({
				drink,
				user: member,
				amount: i,
				createdAt: daysAgo(20 - i),
			});
		}
		signInAs(member);

		const first = await getMyOrdersPage();
		expect(first).toMatchObject({ total: 12, page: 1, pageSize: 5 });
		expect(first.orders.map((o) => o.amount)).toEqual([12, 11, 10, 9, 8]);

		const last = await getMyOrdersPage({ page: 3 });
		expect(last.total).toBe(12);
		expect(last.orders.map((o) => o.amount)).toEqual([2, 1]);

		const { log } = await countQueries(() => getMyOrdersPage({ page: 2 }));
		const pageSql = log
			.flatMap((e) => e.sql)
			.find((s) => /from "order"/.test(s) && /limit/i.test(s));
		expect(pageSql).toMatch(/limit \? offset \?/i);
	});

	test("filters by billing state and by an instant range", async () => {
		await createTenant();
		const member = await createUser();
		const drink = await createDrink({ name: "Pils" });
		await createOrderRow({
			drink,
			user: member,
			amount: 1,
			inBill: true,
			createdAt: daysAgo(10),
		});
		await createOrderRow({
			drink,
			user: member,
			amount: 2,
			createdAt: daysAgo(5),
		});
		await createOrderRow({
			drink,
			user: member,
			amount: 3,
			createdAt: daysAgo(1),
		});
		signInAs(member);

		const open = await getMyOrdersPage({ outOfBillOnly: true });
		expect(open.total).toBe(2);
		expect(open.orders.map((o) => o.amount)).toEqual([3, 2]);

		const range = await getMyOrdersPage({
			from: daysAgo(11).toISOString(),
			to: daysAgo(4).toISOString(),
		});
		expect(range.orders.map((o) => o.amount)).toEqual([2, 1]);
		expect(range.orders[1]?.inBill).toBe(true);
	});

	test("rejects malformed queries", async () => {
		await createTenant();
		signInAs(await createUser());

		await expect(getMyOrdersPage({ page: 0 })).rejects.toThrow();
		await expect(getMyOrdersPage({ from: "yesterday" })).rejects.toThrow();
	});

	test("throws for anonymous callers", async () => {
		await createTenant();

		await expect(getMyOrdersPage()).rejects.toThrow("Nicht angemeldet");
	});
});
