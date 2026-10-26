import { describe, expect, test } from "vitest";

import {
	BODY_START_ROW,
	boolToCell,
	COLUMNS,
	HEADER_ROW,
	normalizeStatus,
	parseBool,
	parseExcelDate,
} from "./members-excel-map";

describe("COLUMNS", () => {
	test("headers are unique and the body starts below the header", () => {
		const headers = COLUMNS.map((c) => c.header);
		expect(new Set(headers).size).toBe(headers.length);
		expect(BODY_START_ROW).toBe(HEADER_ROW + 1);
	});

	test("the first 23 columns mirror the original Corpsverzeichnis", () => {
		expect(COLUMNS.slice(0, 4).map((c) => c.header)).toEqual([
			"ID",
			"Nachname",
			"Vorname",
			"Abteilung",
		]);
		expect(COLUMNS[22]?.header).toBe("Pfad");
		expect(COLUMNS.slice(23).map((c) => c.header)).toEqual([
			"Hausnummer",
			"Adresszusatz",
			"Nur Email",
			"Adresse veraltet",
			"Notizen",
		]);
	});
});

describe("normalizeStatus", () => {
	test.each([
		["fux", "Fuchs"],
		["FUCHS", "Fuchs"],
		["iacb", "IaCB"],
		["I.a.C.B.o.B.", "IaCBoB"],
		["ah idc", "AH idC"],
		["A.H.", "AH"],
		["aheb", "AHEB"],
		["fck", "FCK"],
		["  cb  ", "CB"],
		["Conkneipant", "Conkneipant"],
		["  Neu  ", "Neu"],
		["", ""],
		["   ", ""],
		[null, ""],
		[undefined, ""],
	])("%o → %o", (raw, expected) => {
		expect(normalizeStatus(raw)).toBe(expected);
	});
});

describe("parseBool / boolToCell", () => {
	test.each([
		"1",
		"ja",
		"JA",
		" x ",
		"true",
		"WAHR",
		"y",
		"yes",
	])("%o is true", (raw) => {
		expect(parseBool(raw)).toBe(true);
	});

	test.each([
		"0",
		"nein",
		"",
		"false",
		"2",
		null,
		undefined,
	])("%o is false", (raw) => {
		expect(parseBool(raw)).toBe(false);
	});

	test("round-trips through the cell format", () => {
		expect(parseBool(boolToCell(true))).toBe(true);
		expect(parseBool(boolToCell(false))).toBe(false);
		expect([boolToCell(true), boolToCell(false)]).toEqual(["1", "0"]);
	});
});

describe("parseExcelDate", () => {
	test("a date cell (UTC midnight from ExcelJS) keeps its calendar day", () => {
		expect(parseExcelDate(new Date(Date.UTC(1975, 2, 9)), "ignored")).toBe(
			"09.03.1975",
		);
	});

	test("an Excel serial number is converted with the 1899-12-30 epoch", () => {
		expect(parseExcelDate(27462, "27462")).toBe("09.03.1975");
		expect(parseExcelDate(45658, "45658")).toBe("01.01.2025");
	});

	test("text is kept as typed, blanks become null", () => {
		expect(parseExcelDate("ca. 1975", " ca. 1975 ")).toBe("ca. 1975");
		expect(parseExcelDate(null, "   ")).toBeNull();
		// Out-of-range numbers are not treated as serials.
		expect(parseExcelDate(0, "0")).toBe("0");
		expect(parseExcelDate(100000, "100000")).toBe("100000");
	});
});
