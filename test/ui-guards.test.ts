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

describe("status colours come from theme tokens (#76)", () => {
	const PALETTE =
		/(?<![\w-])(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|decoration)-(?:red|green|blue|yellow|amber|orange|emerald|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-\d{2,3}\b/g;

	// Categorical colours (member status, event type, achievement tier,
	// ranks, chart-like accents) are not statuses and may use the palette.
	// The counts only go down; new status colours use success / warning /
	// info / danger (see src/components/ui/status-badge.tsx).
	const ALLOWED: Record<string, number> = {
		"src/components/members/member-constants.ts": 48,
		"src/components/admin/semesterprogramm/RecurringEventsManager.tsx": 22,
		"src/components/admin/semesterprogramm/EventsManager.tsx": 20,
		"src/components/profile/achievement-ui.tsx": 16,
		"src/components/eloranking/leaderboard-client.tsx": 8,
		"src/components/semesterprogramm/WeekPreview.tsx": 7,
		"src/components/orders/Orderspage.tsx": 6,
		"src/components/bilder/DraggableImageGrid.tsx": 2,
		"src/components/eloranking/stats-overview.tsx": 2,
		"src/components/bilder/OptimizedImagePreview.tsx": 1,
		"src/components/getraenkewart/KasseTab.tsx": 1,
		"src/components/members/AdresslistePage.tsx": 1,
		"src/components/profile/KPIGrid.tsx": 1,
		"src/app/(protected)/semesterprogramm/page.tsx": 14,
	};
	// The public marketing pages have their own per-tenant design.
	const MARKETING =
		/^src\/(components\/(landingpage|footer|header)|app\/\(public\))\//;

	test("no new raw palette colours in feature UI", () => {
		const over: string[] = [];
		for (const file of UI_FILES) {
			const key = file.split(path.sep).join("/");
			if (MARKETING.test(key)) {
				continue;
			}
			const n = (
				readFileSync(path.join(ROOT, file), "utf8").match(PALETTE) ?? []
			).length;
			if (n > (ALLOWED[key] ?? 0)) {
				over.push(
					`${key}: ${n} raw palette classes (allowed ${ALLOWED[key] ?? 0})`,
				);
			}
		}
		expect(over).toEqual([]);
	});
});

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

/** Index of the `>` closing the tag that starts at `from`, skipping `>`
 *  inside {…} expressions and string literals. */
function openingTagEnd(source: string, from: number): number {
	let depth = 0;
	let quote: string | null = null;
	for (let i = from; i < source.length; i++) {
		const c = source[i] as string;
		if (quote) {
			quote = c === quote ? null : quote;
		} else if (`"'\``.includes(c)) {
			quote = c;
		} else if (c === "{" || c === "}") {
			depth += c === "{" ? 1 : -1;
		} else if (c === ">" && depth === 0) {
			return i;
		}
	}
	return source.length;
}

/** Opening tag (attributes) and children of every `<Tag …>…</Tag>`. */
function elements(
	source: string,
	tag: string,
): Array<{ attrs: string; children: string; line: number }> {
	const out: Array<{ attrs: string; children: string; line: number }> = [];
	const open = new RegExp(`<${tag}(?=[\\s>])`, "g");
	for (const m of source.matchAll(open)) {
		const i = openingTagEnd(source, (m.index ?? 0) + tag.length + 1);
		const attrs = source.slice(m.index, i + 1);
		if (attrs.endsWith("/>")) {
			continue;
		}
		const close = source.indexOf(`</${tag}>`, i);
		const children = close < 0 ? "" : source.slice(i + 1, close);
		const line = source.slice(0, m.index).split("\n").length;
		out.push({ attrs, children, line });
	}
	return out;
}

/** Component names a file imports from an icon library. */
function iconNames(source: string): Set<string> {
	const names = new Set<string>();
	for (const m of source.matchAll(
		/import\s*\{([^}]*)\}\s*from\s*"(?:lucide-react|react-icons\/[\w-]+)"/g,
	)) {
		for (const part of (m[1] as string).split(",")) {
			const name = part
				.split(/\s+as\s+/)
				.pop()
				?.trim();
			if (name) {
				names.add(name);
			}
		}
	}
	return names;
}

/** True when the children render no text: only icons, spinners, comments. */
function iconOnly(children: string, icons: Set<string>): boolean {
	if (/sr-only/.test(children)) {
		return false;
	}
	// Any other component (a badge, an avatar…) may render text.
	for (const m of children.matchAll(/<([A-Z][\w.]*)/g)) {
		if (!icons.has(m[1] as string)) {
			return false;
		}
	}
	// Drop comments and every JSX tag (icons, fragments, wrappers).
	const s = children
		.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
		.replace(
			/<\/?(?:[A-Za-z][\w.]*(?:\s(?:[^<>{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)?)?\/?>/g,
			" ",
		);
	if (/["'`]/.test(s)) {
		return false; // a string literal is rendered somewhere
	}
	// Split into JSX text and top-level {expressions}.
	let depth = 0;
	let text = "";
	let expr = "";
	const exprs: string[] = [];
	for (const c of s) {
		if (c === "{") {
			depth++;
			if (depth === 1) {
				expr = "";
				continue;
			}
		} else if (c === "}") {
			depth--;
			if (depth === 0) {
				exprs.push(expr);
				continue;
			}
		}
		if (depth === 0) {
			text += c;
		} else {
			expr += c;
		}
	}
	if (text.trim()) {
		return false;
	}
	// `{busy ? <Spinner/> : <Trash/>}` renders no text; `{label}` does.
	return exprs.every((e) => {
		const parts = e.split(/\?|:|&&|\|\|/);
		const results = parts.length > 1 ? parts.slice(1) : parts;
		return results.every((p) =>
			/^(null|undefined|false)?$/.test(p.replace(/[()\s]/g, "")),
		);
	});
}

describe("icon-only and destructive actions (#77)", () => {
	test("every icon-only button has an accessible name", () => {
		const unnamed: string[] = [];
		for (const file of UI_FILES) {
			const source = readFileSync(path.join(ROOT, file), "utf8");
			const icons = iconNames(source);
			for (const tag of ["Button", "button"]) {
				for (const el of elements(source, tag)) {
					if (
						iconOnly(el.children, icons) &&
						!/aria-label(ledby)?=/.test(el.attrs)
					) {
						unnamed.push(`${file}:${el.line}`);
					}
				}
			}
		}
		expect(unnamed).toEqual([]);
	});

	test("no window.confirm; destructive actions use ConfirmAction", () => {
		expect(offending(UI_FILES, /\b(window\.)?confirm\(/)).toEqual([]);
	});

	test("the sidebar toggle is labelled in German", () => {
		const sidebar = readFileSync(
			path.join(ROOT, "src/components/ui/sidebar.tsx"),
			"utf8",
		);
		expect(sidebar).not.toMatch(/Toggle Sidebar/);
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

	test("only the root layout (and global-error) render <html> and <body>", () => {
		const roots = APP_FILES.filter((f) => /<(html|body)[\s>]/.test(read(f)));
		// global-error replaces the failed root layout, so it needs its own.
		expect(roots.sort()).toEqual(
			[path.join("src", "app", "global-error.tsx"), ROOT_LAYOUT].sort(),
		);
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

describe("loading, error and empty states (#85)", () => {
	const APP = path.join("src", "app");
	const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
	const exists = (f: string) => sourceFiles(path.dirname(f)).includes(f);

	/** Top-level route groups and segments that hold more than one page. */
	function sections(): string[] {
		return readdirSync(path.join(ROOT, APP), { withFileTypes: true })
			.filter((e) => e.isDirectory() && e.name !== "api")
			.map((e) => path.join(APP, e.name))
			.filter(
				(dir) =>
					/\(.+\)$/.test(dir) ||
					sourceFiles(dir).filter((f) => /[\\/]page\.tsx$/.test(f)).length > 1,
			);
	}

	test("the app has a root error boundary, global-error and a 404 page", () => {
		for (const file of ["error.tsx", "global-error.tsx", "not-found.tsx"]) {
			expect(exists(path.join(APP, file)), file).toBe(true);
		}
	});

	test("every route group and multi-page section has its own error.tsx", () => {
		const found = sections();
		expect(found).toEqual(
			expect.arrayContaining([
				path.join(APP, "(protected)"),
				path.join(APP, "(public)"),
				path.join(APP, "auth"),
				path.join(APP, "superadmin"),
			]),
		);
		const missing = found.filter((dir) => !exists(path.join(dir, "error.tsx")));
		expect(missing).toEqual([]);
	});

	test("the protected app shows a skeleton while a page loads", () => {
		expect(exists(path.join(APP, "(protected)", "loading.tsx"))).toBe(true);
		expect(read(path.join(APP, "(protected)", "loading.tsx"))).toMatch(
			/<PageSkeleton[\s/>]/,
		);
	});

	const BOUNDARIES = sourceFiles(APP).filter((f) =>
		/(^|[\\/])(global-)?error\.tsx$/.test(f),
	);

	test("error boundaries are client components with the shared screen", () => {
		const bad = BOUNDARIES.filter(
			(f) =>
				!/^"use client";/.test(read(f)) ||
				!/<(RouteError|ErrorState)[\s/>]/.test(read(f)),
		);
		expect(BOUNDARIES.length).toBeGreaterThanOrEqual(5);
		expect(bad).toEqual([]);
	});

	test("error screens never render the error's message or stack", () => {
		const screens = [
			...BOUNDARIES,
			path.join("src", "components", "errors", "RouteError.tsx"),
			path.join("src", "components", "ui", "error-state.tsx"),
		];
		expect(offending(screens, /\.(message|stack)\b/)).toEqual([]);
	});

	test("there is exactly one EmptyState implementation", () => {
		const all = [
			...UI_FILES,
			...sourceFiles(path.join("src", "components", "ui")),
		];
		const impls = offending(
			all,
			/(function|const|class)\s+(EmptyState|Empty|LoadingState)\b/,
		);
		expect(impls).toEqual([
			expect.stringMatching(/^src[\\/]components[\\/]ui[\\/]empty-state\.tsx:/),
		]);
	});
});
