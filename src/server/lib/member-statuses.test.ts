import { describe, expect, test } from "vitest";
import { setMemberStatuses } from "../../../test/factories/members";
import { createTenant, setupTestDatabases } from "../../../test/harness";
import {
	getTenantMemberStatuses,
	makeBeitragspflichtigMatcher,
} from "./member-statuses";
import { DEFAULT_MEMBER_STATUSES } from "./tenant-default-config";

setupTestDatabases();

describe("getTenantMemberStatuses", () => {
	test("falls back to the German Corps defaults while the table is empty", async () => {
		await createTenant();

		const statuses = await getTenantMemberStatuses();

		expect(statuses).toEqual(
			DEFAULT_MEMBER_STATUSES.map(({ key, label, beitragspflichtig }) => ({
				key,
				label,
				beitragspflichtig,
			})),
		);
		expect(
			statuses.filter((s) => s.beitragspflichtig).map((s) => s.key),
		).toEqual(["Fuchs", "CB", "IaCB", "IaCBoB"]);
	});

	test("returns the tenant's active statuses in display order", async () => {
		await createTenant();
		await setMemberStatuses([
			{ key: "Fux", beitragspflichtig: true },
			{ key: "Alt", isActive: false },
			{ key: "Bursch", label: "Bursche", beitragspflichtig: true },
		]);

		expect(await getTenantMemberStatuses()).toEqual([
			expect.objectContaining({ key: "Fux", beitragspflichtig: true }),
			expect.objectContaining({ key: "Bursch", label: "Bursche" }),
		]);
	});

	test("a table with only inactive rows behaves like an empty one", async () => {
		await createTenant();
		await setMemberStatuses([{ key: "Alt", isActive: false }]);

		expect((await getTenantMemberStatuses()).map((s) => s.key)).toEqual(
			DEFAULT_MEMBER_STATUSES.map((s) => s.key),
		);
	});
});

describe("makeBeitragspflichtigMatcher", () => {
	const defaults = makeBeitragspflichtigMatcher(DEFAULT_MEMBER_STATUSES);

	test.each([
		["Fuchs", true],
		["CB", true],
		["iaCB", true],
		["IaCBoB", true],
		["iacbob", true],
		["I.a.C.B.", true],
		["AH", false],
		["AH idC", false],
		["AHEB", false],
		["FCK", false],
		["Gast", false],
		["", false],
		[null, false],
		[undefined, false],
		["123", false],
	])("%o → %s", (status, expected) => {
		expect(defaults(status)).toBe(expected);
	});

	test("longest key wins so a short key cannot shadow a longer one", () => {
		const match = makeBeitragspflichtigMatcher([
			{ key: "A", label: "A", beitragspflichtig: true },
			{ key: "AB", label: "AB", beitragspflichtig: false },
		]);
		expect(match("ABC")).toBe(false);
		expect(match("Ax")).toBe(true);
	});

	test("keys without letters are ignored", () => {
		const match = makeBeitragspflichtigMatcher([
			{ key: "123", label: "Zahl", beitragspflichtig: true },
		]);
		expect(match("123")).toBe(false);
		expect(match("anything")).toBe(false);
	});
});
