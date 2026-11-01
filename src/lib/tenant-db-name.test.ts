import { describe, expect, test } from "vitest";

import { isValidTursoDatabaseName, tenantDatabaseName } from "./tenant-db-name";

describe("tenantDatabaseName (#224)", () => {
	test("follows the corps-<name>-<city> convention of the existing DBs", () => {
		expect(tenantDatabaseName("Corps Rhenania Stuttgart", "rhenania")).toBe(
			"corps-rhenania-stuttgart",
		);
		expect(tenantDatabaseName("Corps Hassia Darmstadt", "hassia")).toBe(
			"corps-hassia-darmstadt",
		);
	});

	test("transliterates umlauts and ß, and turns everything else into single dashes", () => {
		expect(tenantDatabaseName("Corps Franconia München", "fr")).toBe(
			"corps-franconia-muenchen",
		);
		expect(tenantDatabaseName("Corps Borussia Göttingen", "b")).toBe(
			"corps-borussia-goettingen",
		);
		expect(tenantDatabaseName("Corps Saxo-Thuringia  (Gießen)", "s")).toBe(
			"corps-saxo-thuringia-giessen",
		);
		expect(tenantDatabaseName("Corps Lusatia Brünn & Zürich", "l")).toBe(
			"corps-lusatia-bruenn-zuerich",
		);
	});

	test("adds the corps- prefix when the name lacks it", () => {
		expect(tenantDatabaseName("Hassia Bonn", "hassia-bonn")).toBe(
			"corps-hassia-bonn",
		);
	});

	test("drops whole words from the end to fit Turso's 32 characters", () => {
		expect(tenantDatabaseName("Corps Suevo-Guestphalia München", "sg")).toBe(
			"corps-suevo-guestphalia-muenchen",
		);
		expect(
			tenantDatabaseName("Corps Rheno-Palatia Nürnberg-Erlangen", "rp"),
		).toBe("corps-rheno-palatia-nuernberg");
		const long = tenantDatabaseName(
			"Corps Normannia-Vandalia-Hasso-Borussia zu Berlin",
			"nv",
		);
		expect(long).toBe("corps-normannia-vandalia-hasso");
		expect(isValidTursoDatabaseName(long)).toBe(true);
	});

	test("cuts a single overlong word instead of returning nothing", () => {
		const name = tenantDatabaseName(`Corps ${"x".repeat(40)}`, "x");
		expect(name).toHaveLength(32);
		expect(isValidTursoDatabaseName(name)).toBe(true);
	});

	test("falls back to corps-<slug> when the display name has no usable word", () => {
		expect(tenantDatabaseName("Corps", "hassia")).toBe("corps-hassia");
		expect(tenantDatabaseName("★ ★", "hassia")).toBe("corps-hassia");
	});
});

test("isValidTursoDatabaseName follows Turso's rule", () => {
	expect(isValidTursoDatabaseName("corps-hassia")).toBe(true);
	for (const bad of ["co", "Corps-x", "corps_x", "1corps", "a".repeat(33)]) {
		expect(isValidTursoDatabaseName(bad)).toBe(false);
	}
});
