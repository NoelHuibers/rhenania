// scripts/ci/proxy-db-ratchet.ts — the implicit proxy `db` may only lose users.
//
//   pnpm proxy-db:check     # CI (lint job): print the count, fail if it rose
//   pnpm proxy-db:baseline  # after migrating files off the proxy
//
// Counts the non-test files in src/ and scripts/ that import the `db` or
// `client` proxy from src/server/db/index.ts (#33) and compares the number
// with scripts/ci/proxy-db-baseline.json.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { compareToBaseline, importsProxyDb, isCountedFile } from "./proxy-db";

const BASELINE = path.resolve("scripts/ci/proxy-db-baseline.json");

const files = ["src", "scripts"]
	.flatMap((dir) =>
		readdirSync(dir, { recursive: true, encoding: "utf8" }).map((f) =>
			path.posix.join(dir, f.split(path.sep).join("/")),
		),
	)
	.filter(isCountedFile)
	.filter((file) => importsProxyDb(file, readFileSync(file, "utf8")))
	.sort();

console.log(`Files importing the proxy db (${files.length}):`);
for (const file of files) {
	console.log(`  ${file}`);
}

if (process.argv.includes("--update")) {
	writeFileSync(
		BASELINE,
		`${JSON.stringify({ count: files.length }, null, "\t")}\n`,
	);
	console.log(`Baseline updated: ${files.length}`);
	process.exit(0);
}

const baseline = (
	JSON.parse(readFileSync(BASELINE, "utf8")) as { count: number }
).count;
const result = compareToBaseline(files.length, baseline);
if (!result.ok) {
	console.error(`✗ ${result.message}`);
	process.exit(1);
}
console.log(result.message);
