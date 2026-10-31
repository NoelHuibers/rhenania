// Query budget of the Fuchsenladen billing run (#23): one read batch and one
// atomic write batch, however many members are billed, and a write that is
// refused when the data changed after the read.

import { eq, isNull } from "drizzle-orm";
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
		expect(await createNewFuchsenBilling()).toMatchObject({ ok: true });

		await addMembers(2);
		const small = await countQueries(createNewFuchsenBilling);
		await addMembers(20);
		const large = await countQueries(createNewFuchsenBilling);

		// Carry-over bills for the members of the run before included.
		expect(small.result).toMatchObject({
			ok: true,
			data: { billsCreated: 3 },
		});
		expect(large.result).toMatchObject({
			ok: true,
			data: { billsCreated: 23 },
		});
		// Membership and roles of the session, one read batch and one write
		// batch (was 24 → 118).
		expect(small.total).toBe(4);
		expect(large.total).toBe(small.total);
		expect(large.writes).toBe(1);
		expect(large.log.filter((e) => e.kind === "transaction")).toEqual([]);
	});

	// At 200 members the multi-row INSERTs are split into chunks of 200
	// rows, all in the one write batch.
	test("5 and 200 members: the same round trips and one write batch", async () => {
		await setup();
		await addMembers(1);
		expect(await createNewFuchsenBilling()).toMatchObject({ ok: true });

		await addMembers(5);
		const small = await countQueries(createNewFuchsenBilling);
		await addMembers(200);
		const large = await countQueries(createNewFuchsenBilling);

		expect(small.result).toMatchObject({
			ok: true,
			data: { billsCreated: 6 },
		});
		expect(large.result).toMatchObject({
			ok: true,
			data: { billsCreated: 206 },
		});
		expect(small.total).toBe(4);
		expect(large.total).toBe(small.total);
		expect(large.writes).toBe(1);
		expect(large.log.filter((e) => e.kind === "transaction")).toEqual([]);
		const [write] = large.log.filter((e) =>
			e.sql.some((q) => q.startsWith("insert")),
		);
		const inserts = (table: string) =>
			write?.sql.filter((q) => q.startsWith(`insert into "${table}"`)).length;
		// 206 bills; 400 items: two per new member.
		expect(inserts("fuchsen_bill")).toBe(2);
		expect(inserts("fuchsen_bill_item")).toBe(2);
		// Every order is on a bill now.
		expect(
			await tenantDb().$count(fuchsenOrders, isNull(fuchsenOrders.billId)),
		).toBe(0);
		// Seeds 200 members with orders: well over the 5 s default on CI runners.
	}, 30_000);

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
			ok: false,
			error: expect.stringContaining("neu starten"),
			code: "CONFLICT",
		});
		expect(await tenantDb().select().from(fuchsenBillPeriods)).toEqual([]);

		expect(await createNewFuchsenBilling()).toMatchObject({
			ok: true,
			data: { billsCreated: 1, totalAmount: 3 },
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
			// Before the pinned clock: left to the database default it would
			// take the real time, which is later than the clock once the real
			// date passes it, and the order below would flip.
			createdAt: new Date("2026-10-01T10:00:00Z"),
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

		expect(inner).toMatchObject({ ok: true, data: { billsCreated: 1 } });
		expect(outer).toMatchObject({ ok: false, code: "CONFLICT" });
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
