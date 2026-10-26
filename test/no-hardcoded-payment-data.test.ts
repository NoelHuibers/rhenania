// Guards #9: no bank account, PayPal handle or postal address may be baked
// into shared server or UI code. Payment targets and senders are tenant data
// (konto, getraenke_billing_config, …); a literal here ends up on another
// Corps' bills.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCANNED = ["src/server", "src/components"];

// Rhenania's public club address, still hard-coded in two places that have
// their own issues. Remove an entry once that issue is fixed.
const KNOWN: Record<string, string> = {
	"src/components/footer/footercontent.tsx": "#31",
	"src/server/sempro/SemProPDF.tsx": "#62",
};

const PATTERNS: Array<{ name: string; re: RegExp }> = [
	// IBAN with or without blanks (DE + 20 digits, other countries alike).
	{
		name: "IBAN",
		re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/,
	},
	{ name: "PayPal handle", re: /paypal\.me\/[A-Za-z0-9_]/i },
	{
		name: "street address",
		re: /\b[A-ZÄÖÜ][a-zäöüß-]*(?:straße|strasse|str\.|weg|allee|gasse|platz)\s+\d+/,
	},
	{ name: "postcode and city", re: /\b\d{5} [A-ZÄÖÜ][a-zäöüß]{2,}/ },
];

/** Placeholders and all-zero sample IBANs are fine. */
function isAllowedLine(line: string): boolean {
	return /placeholder/i.test(line) || /\b[A-Z]{2}00(?: ?0{4}){3,}/.test(line);
}

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
		);
}

function findings(file: string): string[] {
	const lines = readFileSync(path.join(ROOT, file), "utf8").split("\n");
	const found: string[] = [];
	for (const [i, line] of lines.entries()) {
		if (isAllowedLine(line)) {
			continue;
		}
		for (const { name, re } of PATTERNS) {
			if (re.test(line)) {
				found.push(`${file}:${i + 1} ${name}: ${line.trim()}`);
			}
		}
	}
	return found;
}

describe("no hard-coded payment or address data (#9)", () => {
	const files = SCANNED.flatMap(sourceFiles);

	test("scans the shared code", () => {
		expect(files.length).toBeGreaterThan(100);
		expect(files).toContain("src/server/lib/getraenkekasse-payment.ts");
	});

	test("no IBAN, PayPal handle or street address literal in src/server and src/components", () => {
		const hits = files
			.filter((file) => !(file in KNOWN))
			.flatMap((file) => findings(file));
		expect(hits).toEqual([]);
	});

	test("the known exceptions still need their issue (drop them once fixed)", () => {
		for (const file of Object.keys(KNOWN)) {
			expect(findings(file), file).not.toEqual([]);
		}
	});

	test("the patterns catch what #9 removed", () => {
		const samples = [
			'iban: "DE65 5002 4024 3386 7890 30",',
			'const raw = "DE65500240243386789030";',
			'paypalBaseUrl: "https://paypal.me/CorpsRhenaniaBier",',
			'street: "Unterbibergerstraße 72",',
			'city: "81737 München",',
		];
		for (const sample of samples) {
			expect(
				PATTERNS.some(({ re }) => re.test(sample)),
				sample,
			).toBe(true);
		}
		expect(isAllowedLine('placeholder="DE00 0000 0000 0000 0000 00"')).toBe(
			true,
		);
	});
});
