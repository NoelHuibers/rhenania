// Guards #36: shared code must not carry one Corps' identity. Rhenania's
// name, domain, address, colours and texts live in its tenant folder
// (src/tenants/rhenania/) or in its tenant record (control DB: display name,
// domains, `branding`). A literal in shared code ends up on another Corps'
// pages, PDFs and mails.
//
// Allowed outside the tenant folder: comments, slug checks
// (`slug === "rhenania"`, `case "rhenania":`), imports from and identifiers
// of the tenant folder, and the justified lines in ALLOWED below.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const TENANT_FOLDERS = "src/tenants/";

const PATTERNS: Array<{ name: string; re: RegExp }> = [
	{ name: "Rhenania name or domain", re: /rhenan/i },
	{ name: "Rhenania city or street", re: /stuttgart|relenberg/i },
	// The Rhenania couleur palette of its public pages.
	{
		name: "Rhenania colour",
		re: /#(?:b85d7c|d98aa6|2f86d4|faf6f4|2c2630|6f6675)\b/i,
	},
];

/** Exact lines allowed to match, each with its reason. */
const ALLOWED: Array<{ file: string; contains: string; reason: string }> = [
	{
		file: "src/proxy.ts",
		contains: '"/studentenzimmer-stuttgart",',
		reason: "route of a Rhenania-only page (404 for other tenants)",
	},
	{
		file: "src/proxy.ts",
		contains: '"/studentenverbindung-stuttgart",',
		reason: "route of a Rhenania-only page (404 for other tenants)",
	},
	{
		file: "src/components/theme-provider.tsx",
		contains: "|studentenverbindung-stuttgart|studentenzimmer-stuttgart)",
		reason: "light-only routes, including the Rhenania-only pages",
	},
	{
		file: "src/app/sitemap.ts",
		contains: 'path: "/studentenzimmer-stuttgart",',
		reason: "sitemap entry used only for the rhenania tenant",
	},
	{
		file: "src/app/sitemap.ts",
		contains: 'path: "/studentenverbindung-stuttgart",',
		reason: "sitemap entry used only for the rhenania tenant",
	},
	{
		file: "src/app/(public)/page.tsx",
		contains: '<JsonLd id="rhenania-organization"',
		reason: 'inside the `case "rhenania"` branch of the dispatcher',
	},
	{
		file: "src/server/db/schema.ts",
		contains: 'location: d.text({ length: 255 }).default("adH Rhenania"),',
		reason:
			"legacy DB default of recurring_event.location; changing it needs a migration. The app always sets the location explicitly (#36)",
	},
];

function sourceFiles(dir: string): string[] {
	return readdirSync(path.join(ROOT, dir), {
		recursive: true,
		withFileTypes: true,
	})
		.filter(
			(e) =>
				e.isFile() &&
				/\.(ts|tsx)$/.test(e.name) &&
				!/\.test\.tsx?$/.test(e.name),
		)
		.map((e) =>
			path
				.relative(ROOT, path.join(e.parentPath, e.name))
				.split(path.sep)
				.join("/"),
		)
		.filter((file) => !file.startsWith(TENANT_FOLDERS));
}

/** The line without the parts that are allowed to name the tenant. */
function stripAllowed(line: string): string {
	const trimmed = line.trim();
	if (/^(\/\/|\/\*|\*|\{\/\*)/.test(trimmed)) {
		return "";
	}
	return (
		line
			// Trailing comment.
			.replace(/\s\/\/\s.*$/, "")
			// Imports from the tenant folder.
			.replace(/["']~\/tenants\/rhenania\/[\w./-]*["']/g, "")
			// Slug checks.
			.replace(/slug\s*[!=]==\s*"rhenania"/g, "")
			.replace(/case "rhenania":/g, "")
			// Identifiers of the tenant folder (RhenaniaLandingPage,
			// RHENANIA_HOME_METADATA, createRhenaniaMetadata).
			.replace(
				/\b\w*(?:Rhenania|RHENANIA)\w+\b|\b\w+(?:Rhenania|RHENANIA)\b/g,
				"",
			)
	);
}

function findings(file: string): string[] {
	const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");
	const found: string[] = [];
	for (const [i, line] of lines.entries()) {
		const rest = stripAllowed(line);
		if (ALLOWED.some((a) => a.file === file && line.includes(a.contains))) {
			continue;
		}
		for (const { name, re } of PATTERNS) {
			if (re.test(rest)) {
				found.push(`${file}:${i + 1} ${name}: ${line.trim()}`);
			}
		}
	}
	return found;
}

describe("no Rhenania literals in shared code (#36)", () => {
	const files = sourceFiles("src");

	test("scans the shared code, not the tenant folders", () => {
		expect(files.length).toBeGreaterThan(300);
		expect(files).toContain("src/server/sempro/SemProPDF.tsx");
		expect(files).toContain("src/components/footer/footercontent.tsx");
		expect(files.some((f) => f.startsWith(TENANT_FOLDERS))).toBe(false);
	});

	test("no Rhenania name, domain, address or colour outside src/tenants/", () => {
		expect(files.flatMap((file) => findings(file))).toEqual([]);
	});

	test("every allowed line still exists (drop entries that are gone)", () => {
		for (const { file, contains } of ALLOWED) {
			const text = readFileSync(path.join(ROOT, file), "utf8");
			expect(text.includes(contains), `${file}: ${contains}`).toBe(true);
		}
	});

	test("the patterns catch what #36 removed, and allow slug checks", () => {
		const caught = [
			'{session.user.email || "x@rhenania-stuttgart.de"}',
			'location: input.location ?? "adH Rhenania",',
			'export const TITLE_PREFIX = "Corps Rhenania Stuttgart Etatplan ";',
			"					Corps Rhenania",
			'					"Relenbergstraße 8",',
			"	Jour Fixe und Rhenanenstammtisch",
			'	"bg-white focus-visible:border-[#2f86d4]",',
			'const displayName = tenant?.displayName ?? "Corps Rhenania";',
		];
		for (const sample of caught) {
			const rest = stripAllowed(sample);
			expect(
				PATTERNS.some(({ re }) => re.test(rest)),
				sample,
			).toBe(true);
		}
		const allowed = [
			'	if (tenant?.slug !== "rhenania") {',
			'		case "rhenania":',
			'} from "~/tenants/rhenania/seo";',
			"	RHENANIA_HOME_METADATA,",
			"		return <RhenaniaContactPage displayName={name} />;",
			"// The legacy `rhenania_` prefix on the existing tenant DB",
			"	 * Rhenania's tenant record holds its address.",
		];
		for (const sample of allowed) {
			const rest = stripAllowed(sample);
			expect(
				PATTERNS.some(({ re }) => re.test(rest)),
				sample,
			).toBe(false);
		}
	});
});
