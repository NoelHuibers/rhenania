import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { drinks } from "~/server/db/schema";
import { createOrderRow } from "../../../test/factories/inventory";
import {
	createDrink,
	createTenant,
	setupTestDatabases,
	tenantDb,
} from "../../../test/harness";
import { isForeignKeyViolation } from "./db-errors";

setupTestDatabases();

describe("isForeignKeyViolation", () => {
	test("recognises the error Drizzle throws for a referenced row", async () => {
		await createTenant();
		const drink = await createDrink();
		await createOrderRow({ drink });

		const error = await tenantDb()
			.delete(drinks)
			.where(eq(drinks.id, drink.id))
			.then(
				() => null,
				(e: unknown) => e,
			);

		expect(error).not.toBeNull();
		expect(isForeignKeyViolation(error)).toBe(true);
	});

	test.each([
		["extended code", { code: "SQLITE_CONSTRAINT_FOREIGNKEY" }],
		["raw code", { code: "SQLITE_CONSTRAINT", rawCode: 787 }],
		[
			"message of a remote error",
			{ message: "SQLITE_CONSTRAINT: FOREIGN KEY constraint failed" },
		],
		[
			"nested cause",
			new Error("Failed query", {
				cause: new Error("x", { cause: { rawCode: 787 } }),
			}),
		],
	])("matches by %s", (_label, error) => {
		expect(isForeignKeyViolation(error)).toBe(true);
	});

	test.each([
		["other constraint", { code: "SQLITE_CONSTRAINT_UNIQUE", rawCode: 2067 }],
		["plain error", new Error("network down")],
		["string", "FOREIGN KEY"],
		["null", null],
		["undefined", undefined],
	])("rejects %s", (_label, error) => {
		expect(isForeignKeyViolation(error)).toBe(false);
	});
});
