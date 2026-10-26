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
