import { describe, expect, test } from "vitest";

import { csvCell, csvRow, csvSafe } from "./csv";

describe("csvSafe (#91)", () => {
	test.each([
		['=HYPERLINK("http://x","Klick")', '\'=HYPERLINK("http://x","Klick")'],
		["+49 711 297308", "'+49 711 297308"],
		["-2+3+cmd|' /C calc'!A0", "'-2+3+cmd|' /C calc'!A0"],
		["@SUM(A1:A9)", "'@SUM(A1:A9)"],
		["\t=1+1", "'\t=1+1"],
		["\r=1+1", "'\r=1+1"],
	])("prefixes %j", (input, expected) => {
		expect(csvSafe(input)).toBe(expected);
	});

	test.each([
		"-5",
		"-12,50",
		"-1.234,56",
		"-3,00 EUR",
		"+7",
		"-10 %",
		"Max",
		"",
		"Pils = gut",
	])("leaves %j alone", (input) => {
		expect(csvSafe(input)).toBe(input);
	});
});

describe("csvCell", () => {
	test("quotes delimiters, quotes and line breaks, doubling inner quotes", () => {
		expect(csvCell("a,b")).toBe('"a,b"');
		expect(csvCell("a;b", ";")).toBe('"a;b"');
		expect(csvCell("a,b", ";")).toBe("a,b");
		expect(csvCell('Pils "Export"')).toBe('"Pils ""Export"""');
		expect(csvCell("Zeile\nzwei")).toBe('"Zeile\nzwei"');
	});

	test("guards formulas before quoting", () => {
		expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
		expect(csvCell("\r=1")).toBe('"\'\r=1"');
	});

	test("writes numbers and empty values", () => {
		expect(csvCell(-4.5)).toBe("-4.5");
		expect(csvCell(null)).toBe("");
		expect(csvCell(undefined, ";", { alwaysQuote: true })).toBe('""');
	});

	test("csvRow joins guarded cells", () => {
		expect(csvRow(["=1", "a;b", 2], ";")).toBe('\'=1;"a;b";2');
		expect(csvRow(["x", 'y"'], ",", { alwaysQuote: true })).toBe('"x","y"""');
	});
});
