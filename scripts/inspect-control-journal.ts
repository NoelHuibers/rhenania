// scripts/inspect-control-journal.ts — read-only: compare the control DB's
// __drizzle_migrations rows against drizzle/control journal + file hashes.

import "dotenv/config";

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { controlClient } from "~/server/db/control";

const FOLDER = path.join(process.cwd(), "drizzle", "control");

async function main() {
	const journal = JSON.parse(
		readFileSync(path.join(FOLDER, "meta", "_journal.json"), "utf8"),
	) as { entries: { idx: number; when: number; tag: string }[] };

	const local = journal.entries.map((e) => {
		let hash = "(file missing)";
		try {
			hash = createHash("sha256")
				.update(readFileSync(path.join(FOLDER, `${e.tag}.sql`), "utf8"))
				.digest("hex");
		} catch {
			// keep placeholder
		}
		return { tag: e.tag, when: e.when, hash };
	});

	const rs = await controlClient.execute(
		"SELECT rowid, hash, created_at FROM __drizzle_migrations ORDER BY created_at",
	);
	console.log(`--- control DB: ${rs.rows.length} recorded migrations ---`);
	for (const r of rs.rows) {
		const match = local.find((l) => l.hash === r.hash);
		console.log(
			`rowid=${r.rowid} created_at=${r.created_at} ${match ? `= ${match.tag}` : `UNKNOWN ${String(r.hash).slice(0, 12)}…`}`,
		);
	}
	console.log(`--- local journal (${local.length}) ---`);
	for (const l of local) {
		const applied = rs.rows.some((r) => r.hash === l.hash);
		console.log(`${l.tag} when=${l.when} ${applied ? "APPLIED" : "MISSING"}`);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
