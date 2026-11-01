import { beforeEach, describe, expect, test } from "vitest";

import { createOrderRow, daysAgo } from "../../../../test/factories/inventory";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../../test/harness";
import {
	getTransactionCount,
	getTransactions,
	type TransactionFilters,
} from "./tracking";

setupTestDatabases();

beforeEach(async () => {
	await createTenant();
	signInAs(await createUser({ roles: ["Kassenwart"] }));
});

/** Five orders spread over five days; index 0 is the newest. */
async function seedOrders() {
	signInAs(await createUser({ name: "Gustav Wart", roles: ["Getränkewart"] }));
	const max = await createUser({ name: "Max Muster" });
	const ute = await createUser({ name: "Ute Beispiel" });
	const pils = await createDrink({ name: "Pils" });
	const mate = await createDrink({ name: "Club-Mate" });
	const rows = [
		{ drink: pils, user: max, createdAt: daysAgo(1) },
		{ drink: mate, user: ute, bookingFor: "CC", createdAt: daysAgo(2) },
		{ drink: pils, user: ute, inBill: true, createdAt: daysAgo(3) },
		{ drink: mate, user: max, bookingFor: "", createdAt: daysAgo(4) },
		{
			drink: pils,
			user: max,
			bookingFor: "AHV",
			inBill: true,
			createdAt: daysAgo(5),
		},
	];
	const created: Awaited<ReturnType<typeof createOrderRow>>[] = [];
	for (const row of rows) {
		created.push(await createOrderRow(row));
	}
	return created;
}

type Page = Awaited<ReturnType<typeof getTransactions>>;
const rowsOf = (page: Page) => (page.ok ? page.data : []);
const ids = (page: Page) => rowsOf(page).map((t) => t.id);
const names = (page: Page) => rowsOf(page).map((t) => t.userName);
const count = (n: number) => ({ ok: true, data: n });

describe("getTransactions / getTransactionCount", () => {
	test("returns all orders newest first by default", async () => {
		const orders = await seedOrders();

		const result = await getTransactions();

		expect(result.ok).toBe(true);
		const rows = result.ok ? result.data : [];
		expect(rows.map((t) => t.id)).toEqual(orders.map((o) => o.id));
		expect(rows[0]).toMatchObject({
			userName: "Max Muster",
			drinkName: "Pils",
			inBill: false,
			// Compare with the stored value; recomputing daysAgo(1) here can
			// land in the next second.
			createdAt: orders[0]?.createdAt,
		});
		expect(await getTransactionCount()).toEqual({ ok: true, data: 5 });
	});

	test.each<[string, TransactionFilters, number[]]>([
		["search by member, case-insensitive", { search: "  UTE " }, [1, 2]],
		["search by drink", { search: "mate" }, [1, 3]],
		["search by purpose", { search: "ahv" }, [4]],
		["billed", { billStatus: "billed" }, [2, 4]],
		["not billed", { billStatus: "not_billed" }, [0, 1, 3]],
		[
			"personal (empty purpose counts as personal)",
			{ purposeFilter: "personal" },
			[0, 2, 3],
		],
		["group bookings", { purposeFilter: "events" }, [1, 4]],
		[
			"combined filters",
			{ search: "max", billStatus: "not_billed", purposeFilter: "personal" },
			[0, 3],
		],
	])("filters: %s", async (_label, filters, expected) => {
		const orders = await seedOrders();

		const result = await getTransactions(filters);
		const total = await getTransactionCount(filters);

		expect(result.ok).toBe(true);
		expect(ids(result)).toEqual(expected.map((i) => orders[i]?.id));
		expect(total).toEqual(count(expected.length));
	});

	test("pages with limit and offset", async () => {
		const orders = await seedOrders();

		const page = await getTransactions({ limit: 2, offset: 2 });

		expect(ids(page)).toEqual([orders[2]?.id, orders[3]?.id]);
	});

	test("finds members whose name starts with an umlaut (#136)", async () => {
		const ozan = await createUser({ name: "Özdemir" });
		await createOrderRow({ drink: await createDrink(), user: ozan });

		const result = await getTransactions({ search: "Özdemir" });

		expect(names(result)).toEqual(["Özdemir"]);
	});

	test("folds the case of non-ASCII letters on both sides", async () => {
		const ozan = await createUser({ name: "Özdemir" });
		const jorg = await createUser({ name: "Jörg Ärmel" });
		const drink = await createDrink({ name: "Kölsch" });
		await createOrderRow({ drink, user: ozan });
		await createOrderRow({ drink, user: jorg });

		for (const search of ["özdemir", "ÖZDEMIR"]) {
			const result = await getTransactions({ search });
			expect(names(result)).toEqual(["Özdemir"]);
			expect(await getTransactionCount({ search })).toEqual(count(1));
		}
		expect(names(await getTransactions({ search: "ärm" }))).toEqual([
			"Jörg Ärmel",
		]);
		expect(await getTransactionCount({ search: "KÖLSCH" })).toEqual(count(2));
	});

	test("treats wildcard characters in the search literally", async () => {
		await seedOrders();

		for (const search of ["%", "_", "*", "?", "[a]"]) {
			expect(await getTransactions({ search })).toEqual({ ok: true, data: [] });
			expect(await getTransactionCount({ search })).toEqual(count(0));
		}
		expect(await getTransactionCount({ search: "Club-" })).toEqual(count(2));
	});
});
