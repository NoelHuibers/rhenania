// scripts/ci/check-migrations.ts — validate drizzle migrations without a DB.
//
//   pnpm db:check                     # folder consistency + drizzle-kit check
//   tsx scripts/ci/check-migrations.ts --base origin/main
//
// With --base, applied migrations must be unchanged, new ones appended with a
// newer `when`, and destructive SQL (DROP/RENAME) fails unless
// MIGRATION_CONTRACT_OK=1 (set by CI for PRs labelled `migration:contract`).

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import {
	type BaseComparison,
	checkAgainstBase,
	checkFolder,
	destructiveStatements,
	type JournalEntry,
} from "./migrations";

const FOLDERS = [
	{ name: "drizzle", allowedIdxGaps: [] },
	// 0004 was applied by hand (one-off script, removed; see git history) and
	// never existed as a file.
	{ name: "drizzle/control", allowedIdxGaps: [4] },
];

function readJournal(json: string): JournalEntry[] {
	return (JSON.parse(json) as { entries: JournalEntry[] }).entries;
}

function git(args: string[]): string {
	return execFileSync("git", args, { encoding: "utf8" });
}

const baseIdx = process.argv.indexOf("--base");
const baseRef = baseIdx > -1 ? process.argv[baseIdx + 1] : undefined;
const errors: string[] = [];
const warnings: string[] = [];

for (const { name, allowedIdxGaps } of FOLDERS) {
	const dir = path.resolve(name);
	const entries = readJournal(
		readFileSync(path.join(dir, "meta", "_journal.json"), "utf8"),
	);
	errors.push(
		...checkFolder({
			name,
			entries,
			allowedIdxGaps,
			sqlFiles: readdirSync(dir).filter((f) => f.endsWith(".sql")),
			metaFiles: readdirSync(path.join(dir, "meta")),
		}),
	);

	if (!baseRef) continue;
	let base: JournalEntry[] = [];
	try {
		base = readJournal(git(["show", `${baseRef}:${name}/meta/_journal.json`]));
	} catch {
		warnings.push(
			`${name}: no journal on ${baseRef}, skipping base comparison`,
		);
		continue;
	}
	const changedFiles: BaseComparison["changedFiles"] = git([
		"diff",
		"--name-status",
		`${baseRef}...HEAD`,
		"--",
		`${name}/*.sql`,
	])
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [status = "", file = ""] = line.split("\t");
			return { status, path: file };
		})
		// drizzle/*.sql also matches nothing in drizzle/control/ thanks to the glob.
		.filter((f) => path.dirname(f.path) === name);
	errors.push(...checkAgainstBase({ name, base, head: entries, changedFiles }));

	for (const entry of entries.slice(base.length)) {
		const file = path.join(dir, `${entry.tag}.sql`);
		if (!existsSync(file)) continue;
		const destructive = destructiveStatements(readFileSync(file, "utf8"));
		if (destructive.length === 0) continue;
		const message = `${name}/${entry.tag}.sql has destructive statements (expand/contract: only after every tenant runs code that no longer needs them):\n    ${destructive.join("\n    ")}`;
		if (process.env.MIGRATION_CONTRACT_OK === "1") warnings.push(message);
		else
			errors.push(
				`${message}\n  Label the PR "migration:contract" once that's true.`,
			);
	}
}

for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length > 0) {
	for (const e of errors) console.error(`error: ${e}`);
	process.exit(1);
}
console.log(
	`Migrations OK (${FOLDERS.map((f) => f.name).join(", ")}${baseRef ? `, compared with ${baseRef}` : ""}).`,
);
