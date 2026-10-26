import { describe, expect, test } from "vitest";

import { escapeICalText, foldLine, formatICalDate } from "./ical";

const octets = (s: string) => Buffer.byteLength(s, "utf8");
const physicalLines = (folded: string) => folded.split("\r\n");
const unfold = (folded: string) => folded.replace(/\r\n /g, "");

describe("foldLine", () => {
	test("leaves lines of up to 75 octets alone", () => {
		const line = `SUMMARY:${"x".repeat(67)}`;
		expect(octets(line)).toBe(75);
		expect(foldLine(line)).toBe(line);
		expect(foldLine("")).toBe("");
	});

	test("folds ASCII at 75 octets, continuation lines include the space", () => {
		const line = `DESCRIPTION:${"a".repeat(200)}`;
		const lines = physicalLines(foldLine(line));

		// 212 octets = 75 + (1 + 74) + (1 + 63)
		expect(lines.map(octets)).toEqual([75, 75, 64]);
		expect(lines.slice(1).every((l) => l.startsWith(" "))).toBe(true);
		expect(unfold(foldLine(line))).toBe(line);
	});

	test("counts umlauts as two octets", () => {
		// 74 ASCII octets, then "ü" (2 octets) does not fit on the first line.
		const line = `${"x".repeat(74)}ü${"ä".repeat(50)}`;
		const lines = physicalLines(foldLine(line));

		expect(lines[0]).toBe("x".repeat(74));
		expect(lines[1]?.startsWith(" ü")).toBe(true);
		expect(lines.every((l) => octets(l) <= 75)).toBe(true);
		expect(unfold(foldLine(line))).toBe(line);
	});

	test("never splits an emoji at the boundary", () => {
		// The 4-octet emoji would occupy octets 73-76.
		const line = `${"x".repeat(72)}🍺 Prost`;
		const lines = physicalLines(foldLine(line));

		expect(lines).toEqual(["x".repeat(72), " 🍺 Prost"]);
		expect(unfold(foldLine(line))).toBe(line);
	});

	test("keeps every physical line within 75 octets for mixed text", () => {
		const line = `SUMMARY:${"Fuchsenprüfung 🍺 – Grill € ".repeat(10)}`;
		const folded = foldLine(line);

		expect(physicalLines(folded).every((l) => octets(l) <= 75)).toBe(true);
		expect(folded).not.toContain("�");
		expect(new TextDecoder().decode(Buffer.from(folded, "utf8"))).toBe(folded);
		expect(unfold(folded)).toBe(line);
	});
});

describe("escapeICalText", () => {
	test("escapes backslashes, separators and every kind of line break", () => {
		expect(escapeICalText("a\\b;c,d\ne\r\nf\rg")).toBe(
			"a\\\\b\\;c\\,d\\ne\\nf\\ng",
		);
	});
});

describe("formatICalDate", () => {
	test("formats UTC in basic format without milliseconds", () => {
		expect(formatICalDate(new Date("2026-11-04T19:00:00.123Z"))).toBe(
			"20261104T190000Z",
		);
	});
});
