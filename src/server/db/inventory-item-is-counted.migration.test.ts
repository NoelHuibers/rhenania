// The backfill of migration 0014 (#221): which existing inventory rows hold a
// real count. Runs the migrations before it on an empty database, seeds rows
// as the old code wrote them, then applies 0014.

import path from "node:path";
import { createClient } from "@libsql/client";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterEach, expect, test } from "vitest";

const migrations = readMigrationFiles({
	migrationsFolder: path.join(process.cwd(), "drizzle"),
});
const client = createClient({ url: ":memory:" });

afterEach(() => client.close());

async function apply(from: number, to: number) {
	for (const migration of migrations.slice(from, to)) {
		for (const statement of migration.sql) {
			if (statement.trim()) {
				await client.execute(statement);
			}
		}
	}
}

test("closed rows and changed running rows become counts, opening rows do not", async () => {
	const isCounted = migrations.findIndex((m) =>
		m.sql.some((s) => s.includes("ADD `isCounted`")),
	);
	expect(isCounted).toBe(14);
	await apply(0, isCounted);

	const rows: Array<
		[id: string, inventory: string, counted: number, previous: number]
	> = [
		// Closed with a count equal to its opening stock: still a count.
		["closed", "old", 10, 10],
		// Opening row, or purchases quick-saved onto it.
		["opening", "run", 10, 10],
		// A purchase-only quick save for a drink new to the inventory.
		["purchases", "run", 0, 0],
		// A quick-saved Ist.
		["quick", "run", 7, 10],
	];
	await client.batch([
		"INSERT INTO inventory (id, status) VALUES ('old', 'closed'), ('run', 'active')",
		...rows.flatMap(([id, inventory, counted, previous]) => [
			{
				sql: "INSERT INTO drink (id, name, price) VALUES (?, ?, 1.2)",
				args: [id, id],
			},
			{
				sql: `INSERT INTO inventory_item (id, inventoryId, drinkId, countedStock, previousStock, priceAtCount)
					VALUES (?, ?, ?, ?, ?, 1.2)`,
				args: [id, inventory, id, counted, previous],
			},
		]),
	]);

	await apply(isCounted, isCounted + 1);

	const result = await client.execute(
		"SELECT id, isCounted FROM inventory_item ORDER BY id",
	);
	expect(result.rows.map((r) => [r.id, r.isCounted])).toEqual([
		["closed", 1],
		["opening", 0],
		["purchases", 0],
		["quick", 1],
	]);
});
