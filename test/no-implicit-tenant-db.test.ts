// Keeps the implicit tenant db out for good (#33). The proxy `db` in
// src/server/db/index.ts and `getCurrentTenantDb` are deleted; a tenant's
// data is reached through a TenantScope (docs/architecture/layering.md).
//
// Biome's noRestrictedImports (biome.jsonc) flags `~/server/db` as typed,
// but matches import strings literally. This test also catches a relative
// path (`../db`, `..`), an explicit `index.ts` and a re-created file.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const DB_DIR = path.join(ROOT, "src/server/db");
const THIS_FILE = path.relative(ROOT, import.meta.filename);

function sourceFiles(dir: string): string[] {
	return readdirSync(path.join(ROOT, dir), {
		recursive: true,
		withFileTypes: true,
	})
		.filter((e) => e.isFile() && /\.(ts|tsx|mts|mjs|js)$/.test(e.name))
		.map((e) => path.relative(ROOT, path.join(e.parentPath, e.name)));
}

const FILES = ["src", "scripts", "test", "e2e"]
	.filter((dir) => existsSync(path.join(ROOT, dir)))
	.flatMap(sourceFiles)
	.filter((f) => f !== THIS_FILE);

const SPECIFIER =
	/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)["']([^"']+)["']/gm;

/** Where an import specifier points, relative to the repo root. */
function resolve(file: string, spec: string): string | null {
	if (spec.startsWith("~/")) {
		return path.join(ROOT, "src", spec.slice(2));
	}
	if (spec.startsWith(".")) {
		return path.resolve(ROOT, path.dirname(file), spec);
	}
	return null;
}

const isDbIndex = (target: string) =>
	target === DB_DIR ||
	/^index(\.[cm]?[jt]sx?)?$/.test(path.relative(DB_DIR, target));

test("src/server/db has no index module (the old proxy)", () => {
	const index = readdirSync(DB_DIR).filter((f) => /^index\./.test(f));
	expect(index).toEqual([]);
});

test("nothing imports src/server/db itself, by any path", () => {
	const hits = FILES.flatMap((file) =>
		[...readFileSync(path.join(ROOT, file), "utf8").matchAll(SPECIFIER)]
			.map((m) => m[1] as string)
			.filter((spec) => {
				const target = resolve(file, spec);
				return target !== null && isDbIndex(target);
			})
			.map((spec) => `${file}: ${spec}`),
	);
	expect(hits).toEqual([]);
});

test("getCurrentTenantDb is gone from the code", () => {
	const hits = FILES.filter((file) =>
		readFileSync(path.join(ROOT, file), "utf8").includes("getCurrentTenantDb"),
	);
	expect(hits).toEqual([]);
});
