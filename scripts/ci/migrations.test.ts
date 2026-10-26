import { describe, expect, test } from "vitest";

import {
	checkAgainstBase,
	checkFolder,
	destructiveStatements,
} from "./migrations";

const entry = (idx: number, when: number, name = "m") => ({
	idx,
	when,
	tag: `${String(idx).padStart(4, "0")}_${name}`,
});

function folder(
	entries: ReturnType<typeof entry>[],
	extra: Partial<Parameters<typeof checkFolder>[0]> = {},
) {
	return {
		name: "drizzle",
		entries,
		sqlFiles: entries.map((e) => `${e.tag}.sql`),
		metaFiles: [
			"_journal.json",
			...entries.map((e) => `${e.tag.slice(0, 4)}_snapshot.json`),
		],
		...extra,
	};
}

describe("checkFolder", () => {
	test("accepts a consistent folder", () => {
		expect(
			checkFolder(folder([entry(0, 100), entry(1, 200), entry(2, 300)])),
		).toEqual([]);
	});

	test("flags a `when` that isn't strictly increasing (drizzle would skip it)", () => {
		const errors = checkFolder(
			folder([entry(0, 100), entry(1, 300), entry(2, 200)]),
		);
		expect(errors.join()).toMatch(/0002_m has when=200, not after 0001_m/);
	});

	test("flags idx gaps unless allowed", () => {
		const entries = [entry(0, 100), entry(1, 200), entry(3, 300)];
		expect(checkFolder(folder(entries)).join()).toMatch(/idx 3 .* should be 2/);
		expect(checkFolder(folder(entries, { allowedIdxGaps: [2] }))).toEqual([]);
	});

	test("flags missing SQL, missing snapshots and orphan SQL files", () => {
		const entries = [entry(0, 100), entry(1, 200)];
		const errors = checkFolder(
			folder(entries, {
				sqlFiles: ["0000_m.sql", "0099_orphan.sql"],
				metaFiles: ["_journal.json", "0001_snapshot.json"],
			}),
		).join("\n");
		expect(errors).toMatch(/missing 0001_m\.sql/);
		expect(errors).toMatch(/missing meta\/0000_snapshot\.json/);
		expect(errors).toMatch(/0099_orphan\.sql is not in the journal/);
	});
});

describe("checkAgainstBase", () => {
	const base = [entry(0, 100), entry(1, 200)];

	test("allows appending a newer migration", () => {
		expect(
			checkAgainstBase({
				name: "drizzle",
				base,
				head: [...base, entry(2, 300)],
				changedFiles: [{ status: "A", path: "drizzle/0002_m.sql" }],
			}),
		).toEqual([]);
	});

	test("rejects edited or removed applied migrations", () => {
		const errors = checkAgainstBase({
			name: "drizzle",
			base,
			head: [entry(0, 100), entry(1, 250)],
			changedFiles: [{ status: "M", path: "drizzle/0001_m.sql" }],
		}).join("\n");
		expect(errors).toMatch(/0001_m was changed or removed/);
		expect(errors).toMatch(/0001_m\.sql was modified/);
	});

	test("rejects a new migration older than the base branch's newest (stale branch)", () => {
		const errors = checkAgainstBase({
			name: "drizzle",
			base,
			head: [...base, entry(2, 150)],
			changedFiles: [],
		});
		expect(errors.join()).toMatch(/regenerate it after rebasing/);
	});
});

describe("destructiveStatements", () => {
	test("finds DROP and RENAME statements between breakpoints", () => {
		const sql = [
			"CREATE TABLE `a` (`id` text);",
			"ALTER TABLE `b` DROP COLUMN `c`;",
			"ALTER TABLE `d` RENAME TO `e`;",
			"DROP TABLE `f`;",
		].join("\n--> statement-breakpoint\n");
		expect(destructiveStatements(sql)).toHaveLength(3);
	});

	test("ignores additive migrations", () => {
		expect(
			destructiveStatements(
				"ALTER TABLE `a` ADD `b` integer DEFAULT 0 NOT NULL;",
			),
		).toEqual([]);
	});
});
