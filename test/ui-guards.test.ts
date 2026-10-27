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
		"src/components/admin/semesterprogramm/recurring-event-constants.ts": 14,
		"src/components/admin/semesterprogramm/RecurringEventCard.tsx": 5,
		"src/components/admin/semesterprogramm/RecurringEventForm.tsx": 3,
		"src/components/admin/semesterprogramm/event-constants.ts": 14,
		"src/components/admin/semesterprogramm/EventRow.tsx": 6,
		"src/components/profile/achievement-ui.tsx": 16,
		"src/components/eloranking/leaderboard-client.tsx": 8,
		"src/components/semesterprogramm/WeekPreview.tsx": 7,
		"src/components/orders/TransactionList.tsx": 3,
		"src/components/bilder/OptimizedImagePreview.tsx": 1,
		"src/components/getraenkewart/kasse/SummarySection.tsx": 1,
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

describe("loading, error and empty states (#85, #34)", () => {
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

	test("error boundaries are client components that report the error", () => {
		const bad = BOUNDARIES.filter(
			(f) =>
				!/^"use client";/.test(read(f)) ||
				!/<RouteError[\s/>]|reportBoundaryError\(/.test(read(f)),
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

describe("one tabs, chip and tile pattern (#87)", () => {
	const UI = path.join("src", "components", "ui");
	const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");

	test("a TabsList picks a layout instead of overriding classes", () => {
		const overridden: string[] = [];
		for (const file of UI_FILES) {
			for (const el of elements(read(file), "TabsList")) {
				if (/className=/.test(el.attrs)) {
					overridden.push(`${file}:${el.line}`);
				}
			}
		}
		expect(overridden).toEqual([]);
	});

	test("?tab= is read through UrlTabs, not by hand", () => {
		expect(offending(UI_FILES, /\.get\(\s*["']tab["']\s*\)/)).toEqual([]);
	});

	test("chip rows and radio buttons come from ChipGroup", () => {
		expect(offending(UI_FILES, /role=["']radio(group)?["']/)).toEqual([]);
		expect(offending(UI_FILES, /rounded-full border px-\d/)).toEqual([]);
	});

	test("the shared blocks are defined only in src/components/ui", () => {
		const impls = offending(
			[...UI_FILES, ...sourceFiles(UI)],
			/(function|const|class)\s+(FilterChips|ChipGroup|BudgetBar|StackedBar|BarLegend|StatTile|StatCard|KPIStatCard|Stat|SectionCard|StatusBadge)\b/,
		).map((hit) => hit.split(":")[0]);
		expect([...new Set(impls)].sort()).toEqual(
			[
				"chip-group.tsx",
				"section-card.tsx",
				"stacked-bar.tsx",
				"stat-tile.tsx",
				"status-badge.tsx",
			].map((f) => path.join(UI, f)),
		);
		expect(UI_FILES).not.toContain(
			path.join("src", "components", "cc-kasse", "KasseUi.tsx"),
		);
	});

	test("no raw palette colours through CSS variables either", () => {
		const files = [...UI_FILES, ...sourceFiles(UI)].filter(
			(f) => !/[\\/](landingpage|footer|header)[\\/]/.test(f),
		);
		expect(
			offending(
				files,
				/var\(--color-(?:red|green|blue|yellow|amber|orange|emerald|lime|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-\d/,
			),
		).toEqual([]);
	});
});

describe("edits are saved on purpose, not on blur (#88)", () => {
	/** Body of every `onBlur={…}` handler, with its line. */
	function blurHandlers(source: string): Array<{ body: string; line: number }> {
		const out: Array<{ body: string; line: number }> = [];
		for (const m of source.matchAll(/onBlur=\{/g)) {
			const start = (m.index ?? 0) + m[0].length;
			let depth = 1;
			let i = start;
			for (; i < source.length && depth > 0; i++) {
				depth += source[i] === "{" ? 1 : source[i] === "}" ? -1 : 0;
			}
			out.push({
				body: source.slice(start, i - 1),
				line: source.slice(0, m.index).split("\n").length,
			});
		}
		return out;
	}

	test("no onBlur handler saves or calls a server action", () => {
		const saving: string[] = [];
		for (const file of UI_FILES) {
			const source = readFileSync(path.join(ROOT, file), "utf8");
			for (const { body, line } of blurHandlers(source)) {
				if (
					/\b(on)?(save|update|commit|submit)\w*\(|startTransition/i.test(body)
				) {
					saving.push(`${file}:${line}`);
				}
			}
		}
		expect(saving).toEqual([]);
	});
});

describe("one responsive list instead of a table plus cards (#89)", () => {
	const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
	const key = (f: string) => f.split(path.sep).join("/");

	/** Children of the element whose opening tag starts at `from`, with
	 *  nested elements of the same tag balanced. */
	function children(source: string, from: number, tag: string): string {
		const end = openingTagEnd(source, from + tag.length + 1);
		if (source[end - 1] === "/") {
			return "";
		}
		const rest = source.slice(end + 1);
		const re = new RegExp(`<(/?)${tag.replace(".", "\\.")}(?=[\\s/>])`, "g");
		let depth = 1;
		for (const m of rest.matchAll(re)) {
			const at = end + 1 + (m.index ?? 0);
			if (m[1]) {
				depth--;
				if (depth === 0) {
					return source.slice(end + 1, at);
				}
			} else if (
				source[openingTagEnd(source, at + tag.length + 1) - 1] !== "/"
			) {
				depth++;
			}
		}
		return rest;
	}

	// `md:hidden` (phones only) and `hidden md:block` (desktop only).
	const PHONE_ONLY = /(?<![\w:-])(?:sm|md|lg):hidden(?![\w-])/;
	const DESKTOP_ONLY =
		/(?<![\w:-])hidden\s+(?:[\w:/[\].-]+\s+)*?(?:sm|md|lg):(?:block|flex|grid|table|inline|inline-flex|inline-block)(?![\w-])/;
	/** `rows.map(`, `sortRows(rows).map(` */
	const MAPPED = /([\w$.?]+(?:\([^()]*\))?)\.map\(/g;
	const TABLE = /<(?:table|Table)[\s>]|getRowModel\(\)/;

	/**
	 * Lists rendered in a phone-only and again in a desktop-only element of
	 * the same file: the same array mapped in both, or cards on phones next
	 * to a desktop-only table.
	 */
	function twiceRendered(source: string): string[] {
		const phone = new Set<string>();
		const desktop = new Set<string>();
		let desktopTable = false;
		for (const m of source.matchAll(/<([A-Za-z][\w.]*)(?=[\s>])/g)) {
			const tag = m[1] as string;
			const at = m.index ?? 0;
			const attrs = source.slice(
				at,
				openingTagEnd(source, at + tag.length + 1),
			);
			const isPhone = PHONE_ONLY.test(attrs);
			if (!/className=/.test(attrs) || !(isPhone || DESKTOP_ONLY.test(attrs))) {
				continue;
			}
			const inner = children(source, at, tag);
			desktopTable ||= !isPhone && TABLE.test(inner);
			for (const map of inner.matchAll(MAPPED)) {
				(isPhone ? phone : desktop).add(map[1] as string);
			}
		}
		const twice = [...phone].filter((array) => desktop.has(array));
		if (twice.length === 0 && desktopTable && phone.size > 0) {
			return [`${[...phone].join(", ")} (cards next to a desktop table)`];
		}
		return twice;
	}

	test("the heuristic spots a table plus cards over the same rows", () => {
		const twice = `
			<div className="space-y-3 md:hidden">
				{rows.map((r) => <div key={r.id}><div>{r.name}</div></div>)}
			</div>
			<div className="hidden rounded-md md:block">
				<Table>{rows.map((r) => <TableRow key={r.id} />)}</Table>
			</div>`;
		expect(twiceRendered(twice)).toEqual(["rows"]);
		const sorted = `
			<div className="sm:hidden">{sort(rows).map((r) => <b key={r} />)}</div>
			<div className="hidden sm:block">{sort(rows).map((r) => <i key={r} />)}</div>`;
		expect(twiceRendered(sorted)).toEqual(["sort(rows)"]);
		const tanstack = `
			<div className="md:hidden">{visible.map((r) => <b key={r} />)}</div>
			<div className="hidden md:block"><table>{rowModel.rows.map(cell)}</table></div>`;
		expect(twiceRendered(tanstack)).toHaveLength(1);
		const once = `
			<div className="md:hidden">{tabs.map((t) => <b key={t} />)}</div>
			<div className="hidden md:flex">{rows.map((r) => <i key={r} />)}</div>
			<TableHead className="hidden sm:table-cell">Datum</TableHead>
			<DataList data={rows} columns={columns} />`;
		expect(twiceRendered(once)).toEqual([]);
	});

	test("no list renders its rows twice (use DataList)", () => {
		const twice = [
			...UI_FILES,
			...sourceFiles(path.join("src", "components", "ui")),
		]
			.map((f) => ({ f, arrays: twiceRendered(read(f)) }))
			.filter(({ arrays }) => arrays.length > 0)
			.map(({ f, arrays }) => `${key(f)}: ${arrays.join(", ")}`);
		expect(twice).toEqual([]);
	});
});

describe("focused component files (#89)", () => {
	const COMPONENTS = sourceFiles(path.join("src", "components"));
	const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
	const key = (f: string) => f.split(path.sep).join("/");
	const lineCount = (f: string) => read(f).trimEnd().split("\n").length;

	const MAX_LINES = 400;
	// Only for files we do not own. Split everything else.
	const LONG_FILES: Record<string, string> = {
		"src/components/ui/sidebar.tsx":
			"vendored shadcn/ui primitive, kept close to upstream for updates",
	};

	test(`no component file is over ${MAX_LINES} lines`, () => {
		const long = COMPONENTS.filter((f) => !(key(f) in LONG_FILES))
			.filter((f) => lineCount(f) > MAX_LINES)
			.map((f) => `${key(f)}: ${lineCount(f)} lines`);
		expect(long).toEqual([]);
	});

	test("the long-file allowlist has no stale entries", () => {
		const stale = Object.keys(LONG_FILES).filter(
			(f) => !COMPONENTS.some((c) => key(c) === f) || lineCount(f) <= MAX_LINES,
		);
		expect(stale).toEqual([]);
	});
});
