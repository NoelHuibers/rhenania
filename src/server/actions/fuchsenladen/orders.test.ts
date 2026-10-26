import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { fuchsenOrders } from "~/server/db/schema";
import {
	createFuchsenItem,
	createFuchsenOrder,
} from "../../../../test/factories/fuchsenladen";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	signOut,
	tenantDb,
} from "../../../../test/harness";
import {
	createFuchsenOrder as createOrderAction,
	deleteFuchsenOrder,
	getAllFuchsenOrders,
	getFuchsenBillsByUser,
	getFuchsenOrdersForUser,
	getMyFuchsenOrders,
	getMyFuchsenSummary,
	markAllUserFuchsenOrdersPaid,
	updateFuchsenOrderStatus,
} from "./orders";

setupTestDatabases();

const NOW = new Date("2026-10-28T11:00:00Z");

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
});

async function orderRow(id: string) {
	const [row] = await tenantDb()
		.select()
		.from(fuchsenOrders)
		.where(eq(fuchsenOrders.id, id));
	return row;
}

describe("createFuchsenOrder", () => {
	test("books the order to the signed-in member", async () => {
		await createTenant();
		const member = await createUser({ name: "Fritz Fux" });
		const item = await createFuchsenItem({ name: "Mars", price: 1.2 });
		signInAs(member);

		const result = await createOrderAction({
			itemId: item.id,
			itemName: "Mars",
			amount: 3,
			pricePerUnit: 1.2,
			total: 3.6,
		});

		expect(result.success).toBe(true);
		expect(await orderRow(result.orderId ?? "")).toMatchObject({
			userId: member.id,
			userName: "Fritz Fux",
			itemId: item.id,
			itemName: "Mars",
			amount: 3,
			total: 3.6,
			status: "Offen",
			billId: null,
		});
	});

	test("rejects anonymous callers, non-positive amounts and inconsistent totals", async () => {
		await createTenant();
		const item = await createFuchsenItem({ price: 1 });
		const order = {
			itemId: item.id,
			itemName: item.name,
			amount: 2,
			pricePerUnit: 1,
			total: 2,
		};

		expect((await createOrderAction(order)).success).toBe(false);

		signInAs(await createUser());
		expect(
			(await createOrderAction({ ...order, amount: 0, total: 0 })).success,
		).toBe(false);
		expect((await createOrderAction({ ...order, total: 3 })).success).toBe(
			false,
		);
		expect(await tenantDb().select().from(fuchsenOrders)).toHaveLength(0);
	});
});

describe("member views", () => {
	test("members see only their own orders and totals", async () => {
		await createTenant();
		const me = await createUser();
		const other = await createUser();
		const item = await createFuchsenItem({ price: 2 });
		await createFuchsenOrder({ user: me, item, amount: 1 });
		await createFuchsenOrder({ user: me, item, amount: 2, status: "Bezahlt" });
		await createFuchsenOrder({ user: me, item, amount: 3 });
		await createFuchsenOrder({ user: other, item, amount: 5 });
		signInAs(me);

		expect(await getMyFuchsenOrders()).toHaveLength(3);
		expect(await getMyFuchsenSummary()).toEqual({
			openTotal: 8,
			paidTotal: 4,
			openCount: 2,
		});
	});

	test("signed-out visitors get empty views", async () => {
		await createTenant();
		signOut();

		expect(await getMyFuchsenOrders()).toEqual([]);
		expect(await getMyFuchsenSummary()).toEqual({
			openTotal: 0,
			paidTotal: 0,
			openCount: 0,
		});
	});
});

describe("Fuchsenwart views", () => {
	test("aggregates orders per member, highest open amount first", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Fuchs"] }));
		const anton = await createUser({ name: "Anton" });
		const berta = await createUser({ name: "Berta" });
		const item = await createFuchsenItem({ price: 1.5 });
		await createFuchsenOrder({ user: anton, item, amount: 1 });
		await createFuchsenOrder({
			user: anton,
			item,
			amount: 4,
			status: "Bezahlt",
		});
		await createFuchsenOrder({ user: berta, item, amount: 2 });
		await createFuchsenOrder({ user: berta, item, amount: 2 });

		expect(await getFuchsenBillsByUser()).toEqual([
			{
				userId: berta.id,
				userName: "Berta",
				openTotal: 6,
				paidTotal: 0,
				openCount: 2,
				totalCount: 2,
			},
			{
				userId: anton.id,
				userName: "Anton",
				openTotal: 1.5,
				paidTotal: 6,
				openCount: 1,
				totalCount: 2,
			},
		]);
		expect(await getAllFuchsenOrders()).toHaveLength(4);
		expect(await getFuchsenOrdersForUser(anton.id)).toHaveLength(2);
	});
});

describe("updateFuchsenOrderStatus", () => {
	test("marks an order paid with a timestamp and can reopen it", async () => {
		await createTenant();
		const member = await createUser();
		const order = await createFuchsenOrder({
			user: member,
			item: await createFuchsenItem(),
		});
		signInAs(await createUser({ roles: ["Fuchs"] }));

		expect((await updateFuchsenOrderStatus(order.id, "Bezahlt")).success).toBe(
			true,
		);
		expect(await orderRow(order.id)).toMatchObject({
			status: "Bezahlt",
			paidAt: NOW,
		});

		await updateFuchsenOrderStatus(order.id, "Offen");
		expect(await orderRow(order.id)).toMatchObject({
			status: "Offen",
			paidAt: null,
		});
	});

	test("admins may change the status too", async () => {
		await createTenant();
		const order = await createFuchsenOrder({
			user: await createUser(),
			item: await createFuchsenItem(),
		});
		signInAs(await createUser({ roles: ["Admin"] }));

		expect((await updateFuchsenOrderStatus(order.id, "Bezahlt")).success).toBe(
			true,
		);
	});

	test("is refused for members without the Fuchs or Admin role", async () => {
		await createTenant();
		const member = await createUser();
		const order = await createFuchsenOrder({
			user: member,
			item: await createFuchsenItem(),
		});
		signInAs(member);

		expect(await updateFuchsenOrderStatus(order.id, "Bezahlt")).toEqual({
			success: false,
			error: "Keine Berechtigung",
		});
		expect((await orderRow(order.id))?.status).toBe("Offen");
	});

	test("reports unknown orders", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Fuchs"] }));

		expect(await updateFuchsenOrderStatus("missing", "Bezahlt")).toEqual({
			success: false,
			error: "Bestellung nicht gefunden",
		});
	});
});

describe("markAllUserFuchsenOrdersPaid", () => {
	test("pays every open order of that member only", async () => {
		await createTenant();
		const member = await createUser();
		const other = await createUser();
		const item = await createFuchsenItem();
		await createFuchsenOrder({ user: member, item });
		await createFuchsenOrder({ user: member, item });
		await createFuchsenOrder({ user: member, item, status: "Bezahlt" });
		const othersOrder = await createFuchsenOrder({ user: other, item });
		signInAs(await createUser({ roles: ["Fuchs"] }));

		const result = await markAllUserFuchsenOrdersPaid(member.id);

		expect(result).toEqual({ success: true, count: 2 });
		const mine = await getFuchsenOrdersForUser(member.id);
		expect(mine.every((o) => o.status === "Bezahlt")).toBe(true);
		expect((await orderRow(othersOrder.id))?.status).toBe("Offen");
	});
});

describe("deleteFuchsenOrder", () => {
	test("removes the order", async () => {
		await createTenant();
		const order = await createFuchsenOrder({
			user: await createUser(),
			item: await createFuchsenItem(),
		});
		signInAs(await createUser({ roles: ["Fuchs"] }));

		expect(await deleteFuchsenOrder(order.id)).toEqual({ success: true });
		expect(await orderRow(order.id)).toBeUndefined();
	});

	test("is refused for plain members", async () => {
		await createTenant();
		const member = await createUser();
		const order = await createFuchsenOrder({
			user: member,
			item: await createFuchsenItem(),
		});
		signInAs(member);

		expect((await deleteFuchsenOrder(order.id)).success).toBe(false);
		expect(await orderRow(order.id)).toBeDefined();
	});
});
