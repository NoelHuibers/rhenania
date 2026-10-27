// Guards #90: everything in public/ is deployed and can be downloaded, so it
// should be small, in use, and every asset path the code names must exist.
// Re-encode photos to WebP (at most 2560 px wide) before adding them here;
// next/image serves resized copies, but the source still has to be fetched
// and decoded by the image optimizer.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const MAX_BYTES = 1024 * 1024;

// Files allowed over MAX_BYTES, with the reason.
const LARGE_ALLOWED: Record<string, string> = {};

// Files used without their name appearing in src/, with the reason.
const UNREFERENCED_ALLOWED: Record<string, string> = {
	"sempro/Wappen_Tranzparent.png":
		"SemPro PDF coat of arms; tenant branding data can name it",
};

// Asset paths the code names that don't exist yet, with the reason.
const MISSING_ALLOWED: Record<string, string> = {
	"/placeholder.svg": "pre-existing missing avatar/drink placeholder",
};

function filesIn(dir: string): string[] {
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((e) => e.isFile())
		.map((e) =>
			path.relative(dir, path.join(e.parentPath, e.name)).replaceAll("\\", "/"),
		);
}

const publicFiles = filesIn(PUBLIC);
const sources = filesIn(path.join(ROOT, "src"))
	.filter((f) => /\.(ts|tsx|css)$/.test(f) && !/\.test\.tsx?$/.test(f))
	.map((f) => readFileSync(path.join(ROOT, "src", f), "utf8"));

describe("public/ assets (#90)", () => {
	test("no file is larger than 1 MB unless allowlisted", () => {
		const tooLarge = publicFiles.filter(
			(f) =>
				!(f in LARGE_ALLOWED) &&
				statSync(path.join(PUBLIC, f)).size > MAX_BYTES,
		);
		expect(tooLarge).toEqual([]);
	});

	test("every file is referenced by name from src/", () => {
		const unused = publicFiles.filter(
			(f) =>
				!(f in UNREFERENCED_ALLOWED) &&
				!sources.some((s) => s.includes(path.posix.basename(f))),
		);
		expect(unused).toEqual([]);
	});

	test("every asset path named in src/ exists", () => {
		const named = new Set(
			sources.flatMap((s) =>
				[
					...s.matchAll(
						/["'`}](\/[\w./-]+\.(?:png|jpe?g|gif|webp|avif|svg|ico|mp4|webm))["'`?]/g,
					),
				].map((m) => m[1] ?? ""),
			),
		);
		const missing = [...named].filter(
			(p) => !(p in MISSING_ALLOWED) && !existsSync(path.join(PUBLIC, p)),
		);
		expect(missing).toEqual([]);
	});

	test("allowlists hold no stale entries", () => {
		for (const f of [
			...Object.keys(LARGE_ALLOWED),
			...Object.keys(UNREFERENCED_ALLOWED),
		]) {
			expect(publicFiles, f).toContain(f);
		}
	});
});
