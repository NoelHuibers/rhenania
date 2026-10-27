// Query budget of the Fuchsenladen billing run (#23): one read batch and one
// atomic write batch, however many members are billed, and a write that is
// refused when the data changed after the read.

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	fuchsenBillPeriods,
	fuchsenBills,
	fuchsenOrders,
} from "~/server/db/schema";
import {
	createFuchsenBillPeriod,
	createFuchsenItem,
	createFuchsenOrder,
} from "../../../../test/factories/fuchsenladen";
import {
	beforeNextWriteBatch,
	countQueries,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";
import { createNewFuchsenBilling } from "./billings";

setupTestDatabases();

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-10-28T11:00:00Z"));
	vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

let member = 0;

/** `n` members with two items each and an open bill from an earlier period. */
async function addMembers(n: number) {
	const mars = await createFuchsenItem({ name: "Mars", price: 1.5 });
	const mate = await createFuchsenItem({ name: "Mate", price: 2 });
	const users: TestUser[] = [];
	for (let i = 0; i < n; i++) {
		member++;
		const user = await createUser({ name: `Fuchs ${member}` });
		await createFuchsenOrder({ user, item: mars, amount: 2 });
		await createFuchsenOrder({ user, item: mate });
		users.push(user);
	}
	await createFuchsenBillPeriod({
		bills: users.map((user, i) => ({
			user,
			itemsTotal: 4,
			status: i % 3 === 0 ? ("Gestundet" as const) : ("Unbezahlt" as const),
		})),
	});
}

async function setup() {
	await createTenant();
	signInAs(await createUser({ name: "Fuchsenwart", roles: ["Fuchs"] }));
}

describe("Fuchsenladen billing run (#23)", () => {
	test("the round trips do not grow with the members", async () => {
		await setup();
		await addMembers(1);
		expect(await createNewFuchsenBilling()).toMatchObject({ success: true });

		await addMembers(2);
		const small = await countQueries(createNewFuchsenBilling);
		await addMembers(20);
		const large = await countQueries(createNewFuchsenBilling);

		// Carry-over bills for the members of the run before included.
		expect(small.result).toMatchObject({ success: true, billsCreated: 3 });
		expect(large.result).toMatchObject({ success: true, billsCreated: 23 });
		// Session, the two role checks, one read batch and one write batch
		// (was 24 → 118).
		expect(small.total).toBe(6);
		expect(large.total).toBe(small.total);
		expect(large.writes).toBe(1);
		expect(large.log.filter((e) => e.kind === "transaction")).toEqual([]);
	});

	test("an order paid meanwhile: nothing is written, the next run bills the rest", async () => {
		await setup();
		const anton = await createUser({ name: "Anton" });
		const mars = await createFuchsenItem({ name: "Mars", price: 1.5 });
		const paid = await createFuchsenOrder({ user: anton, item: mars });
		await createFuchsenOrder({ user: anton, item: mars, amount: 2 });
		beforeNextWriteBatch(() =>
			tenantDb()
				.update(fuchsenOrders)
				.set({ status: "Bezahlt" })
				.where(eq(fuchsenOrders.id, paid.id)),
		);

		expect(await createNewFuchsenBilling()).toMatchObject({
			success: false,
			billsCreated: 0,
			message: expect.stringContaining("neu starten"),
		});
		expect(await tenantDb().select().from(fuchsenBillPeriods)).toEqual([]);

		expect(await createNewFuchsenBilling()).toMatchObject({
			success: true,
			billsCreated: 1,
			totalAmount: 3,
		});
		const [stillPaid] = await tenantDb()
			.select()
			.from(fuchsenOrders)
			.where(eq(fuchsenOrders.id, paid.id));
		expect(stillPaid?.billId).toBeNull();
	});

	test("another run in between: every order and every debt is billed once", async () => {
		await setup();
		const anton = await createUser({ name: "Anton" });
		await createFuchsenBillPeriod({
			billNumber: "KW-40-26",
			bills: [{ user: anton, itemsTotal: 5 }],
		});
		await createFuchsenOrder({
			user: anton,
			item: await createFuchsenItem({ price: 2 }),
		});
		let inner: Awaited<ReturnType<typeof createNewFuchsenBilling>> | undefined;
		beforeNextWriteBatch(async () => {
			inner = await createNewFuchsenBilling();
		});

		const outer = await createNewFuchsenBilling();

		expect(inner).toMatchObject({ success: true, billsCreated: 1 });
		expect(outer).toMatchObject({ success: false, billsCreated: 0 });
		expect(
			(
				await tenantDb()
					.select()
					.from(fuchsenBills)
					.where(eq(fuchsenBills.userId, anton.id))
					.orderBy(fuchsenBills.createdAt)
			).map((b) => [b.status, b.total]),
		).toEqual([
			["Übertragen", 5],
			["Unbezahlt", 7],
		]);
	});
});
