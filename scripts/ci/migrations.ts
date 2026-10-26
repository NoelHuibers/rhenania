// scripts/ci/migrations.ts — pure checks for drizzle migration folders.
//
// Drizzle's migrator (and scripts/migrate-tenants.ts) treat every journal
// entry with `when <= max(applied created_at)` as applied. An out-of-order
// `when`, an edited migration or a missing file therefore fails silently in
// production (this is how the Hassia journal broke). These checks catch that
// in CI, before anything reaches a database.

export type JournalEntry = { idx: number; when: number; tag: string };

export type MigrationFolder = {
	/** Display name, e.g. "drizzle" or "drizzle/control". */
	name: string;
	entries: JournalEntry[];
	/** File names in the folder (`*.sql`). */
	sqlFiles: string[];
	/** File names in `meta/` (`*_snapshot.json`, `_journal.json`). */
	metaFiles: string[];
	/** Journal indices allowed to be missing (historic gaps). */
	allowedIdxGaps?: number[];
};

export function checkFolder(folder: MigrationFolder): string[] {
	const errors: string[] = [];
	const { name, entries } = folder;
	const gaps = new Set(folder.allowedIdxGaps ?? []);

	let expectedIdx = 0;
	let previous: JournalEntry | undefined;
	for (const entry of entries) {
		while (gaps.has(expectedIdx) && entry.idx !== expectedIdx) {
			expectedIdx++;
		}
		if (entry.idx !== expectedIdx) {
			errors.push(
				`${name}: journal idx ${entry.idx} (${entry.tag}) should be ${expectedIdx}`,
			);
		}
		expectedIdx = entry.idx + 1;

		if (previous && entry.when <= previous.when) {
			errors.push(
				`${name}: ${entry.tag} has when=${entry.when}, not after ${previous.tag} (${previous.when}); drizzle would skip it`,
			);
		}
		previous = entry;

		const prefix = String(entry.idx).padStart(4, "0");
		if (!entry.tag.startsWith(`${prefix}_`)) {
			errors.push(`${name}: tag ${entry.tag} doesn't start with ${prefix}_`);
		}
		if (!folder.sqlFiles.includes(`${entry.tag}.sql`)) {
			errors.push(`${name}: missing ${entry.tag}.sql`);
		}
		if (!folder.metaFiles.includes(`${prefix}_snapshot.json`)) {
			errors.push(`${name}: missing meta/${prefix}_snapshot.json`);
		}
	}

	const tags = new Set(entries.map((e) => `${e.tag}.sql`));
	for (const file of folder.sqlFiles) {
		if (!tags.has(file)) {
			errors.push(`${name}: ${file} is not in the journal`);
		}
	}
	return errors;
}

export type BaseComparison = {
	name: string;
	base: JournalEntry[];
	head: JournalEntry[];
	/** `git diff --name-status <base>...HEAD -- <folder>` lines, e.g. "M\tdrizzle/0003_x.sql". */
	changedFiles: Array<{ status: string; path: string }>;
};

/** Applied migrations are immutable; new ones may only be appended. */
export function checkAgainstBase(cmp: BaseComparison): string[] {
	const errors: string[] = [];
	const { name, base, head } = cmp;

	for (const [i, entry] of base.entries()) {
		const now = head[i];
		if (
			!now ||
			now.tag !== entry.tag ||
			now.when !== entry.when ||
			now.idx !== entry.idx
		) {
			errors.push(`${name}: journal entry ${entry.tag} was changed or removed`);
		}
	}
	const baseMax = Math.max(0, ...base.map((e) => e.when));
	for (const entry of head.slice(base.length)) {
		if (entry.when <= baseMax) {
			errors.push(
				`${name}: new migration ${entry.tag} has when=${entry.when} <= newest on the base branch (${baseMax}); regenerate it after rebasing`,
			);
		}
	}
	for (const { status, path } of cmp.changedFiles) {
		if (path.endsWith(".sql") && !status.startsWith("A")) {
			errors.push(
				`${name}: ${path} was modified (${status}); applied migrations must not change`,
			);
		}
	}
	return errors;
}

const DESTRUCTIVE = [
	/\bDROP\s+TABLE\b/i,
	/\bDROP\s+COLUMN\b/i,
	/\bRENAME\s+(?:TO|COLUMN)\b/i,
	/\bDROP\s+INDEX\b/i,
];

/** Destructive statements in `sql` (contract migrations need explicit sign-off). */
export function destructiveStatements(sql: string): string[] {
	return sql
		.split("--> statement-breakpoint")
		.map((s) => s.trim())
		.filter((s) => DESTRUCTIVE.some((re) => re.test(s)));
}
