// Source guards for UI conventions that types and Biome cannot express.
// Each rule scans the UI source line by line and reports `file:line` so a
// failure points straight at the offending code.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(path.join(ROOT, dir), {
		withFileTypes: true,
	})) {
		const rel = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...sourceFiles(rel));
		} else if (
			/\.tsx?$/.test(entry.name) &&
			!/\.test\.tsx?$/.test(entry.name)
		) {
			out.push(rel);
		}
	}
	return out;
}

/** Feature UI: everything users see, minus the generic shadcn primitives. */
const UI_FILES = [
	...sourceFiles("src/components"),
	...sourceFiles("src/app"),
].filter((f) => !f.startsWith(path.join("src", "components", "ui")));

function offending(files: string[], pattern: RegExp): string[] {
	const hits: string[] = [];
	for (const file of files) {
		const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");
		lines.forEach((line, i) => {
			if (pattern.test(line)) {
				hits.push(`${file}:${i + 1}: ${line.trim()}`);
			}
		});
	}
	return hits;
}

describe("money and dates go through src/lib/format.ts (#83)", () => {
	test("no euro sign in front of an amount (€3.50)", () => {
		expect(offending(UI_FILES, /€\s*\$?\{/)).toEqual([]);
	});

	test("no hand-made decimals next to a euro sign", () => {
		expect(offending(UI_FILES, /toFixed\(.*€|€.*toFixed\(/)).toEqual([]);
		expect(offending(UI_FILES, /toFixed\(\d\)\.replace\(/)).toEqual([]);
	});

	test("no private currency or date formatters", () => {
		expect(
			offending(UI_FILES, /new Intl\.(NumberFormat|DateTimeFormat)\(/),
		).toEqual([]);
	});

	test("no browser-locale or browser-timezone date formatting", () => {
		expect(
			offending(
				UI_FILES,
				/toLocale(Date|Time)String\(|Date\([^)]*\)\.toLocaleString\(/,
			),
		).toEqual([]);
	});
});

describe("the app shell lives in the protected layout (#82)", () => {
	const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
	const LAYOUT = path.join("src", "app", "(protected)", "layout.tsx");

	test("pages do not mount their own sidebar", () => {
		const pages = sourceFiles(path.join("src", "app", "(protected)")).filter(
			(f) => f !== LAYOUT && /SidebarLayout/.test(read(f)),
		);
		expect(pages).toEqual([]);
		expect(read(LAYOUT)).toMatch(/<SidebarLayout[\s>]/);
	});

	test("no Tailwind v3 arbitrary CSS-variable syntax (w-[--x])", () => {
		expect(
			offending([...UI_FILES, ...sourceFiles("src/components/ui")], /-\[--/),
		).toEqual([]);
	});
});

describe("one document root, one toaster, one theme (#86)", () => {
	const ROOT_LAYOUT = path.join("src", "app", "layout.tsx");
	const APP_FILES = sourceFiles("src/app");
	const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

	test("only the root layout renders <html> and <body>", () => {
		const roots = APP_FILES.filter((f) => /<(html|body)[\s>]/.test(read(f)));
		expect(roots).toEqual([ROOT_LAYOUT]);
	});

	test("the toaster is mounted once, in the root layout", () => {
		const mounts = [...UI_FILES, ...sourceFiles("src/components/ui")].filter(
			(f) => /<Toaster[\s/>]/.test(read(f)),
		);
		expect(mounts).toEqual([ROOT_LAYOUT]);
	});

	test("the theme provider wraps every route from the root layout", () => {
		expect(read(ROOT_LAYOUT)).toMatch(/<AppThemeProvider[\s>]/);
		const others = APP_FILES.filter(
			(f) => f !== ROOT_LAYOUT && /ThemeProvider/.test(read(f)),
		);
		expect(others).toEqual([]);
	});
});
