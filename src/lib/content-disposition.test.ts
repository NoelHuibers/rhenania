import { describe, expect, test } from "vitest";

import {
	asciiFileName,
	attachmentDisposition,
	fileNameFromDisposition,
} from "./content-disposition";

describe("asciiFileName", () => {
	test("transliterates German letters and typographic punctuation", () => {
		expect(asciiFileName("SoSe_2027_–_Jubiläum.pdf")).toBe(
			"SoSe_2027_-_Jubilaeum.pdf",
		);
		expect(asciiFileName("Größe—Übung’s.pdf")).toBe("Groesse-Uebung's.pdf");
	});

	test("strips accents and replaces anything else that is not printable ASCII", () => {
		expect(asciiFileName("Café_Kneipe_🍺.pdf")).toBe("Cafe_Kneipe__.pdf");
		expect(asciiFileName('a"b\\c\r\n.pdf')).toBe("a_b_c__.pdf");
	});
});

describe("attachmentDisposition", () => {
	test("plain ASCII names need only the quoted filename", () => {
		expect(attachmentDisposition("Semesterprogramm_WS_2026.pdf")).toBe(
			'attachment; filename="Semesterprogramm_WS_2026.pdf"',
		);
	});

	test("adds the exact UTF-8 name as filename* (RFC 6266/8187)", () => {
		expect(attachmentDisposition("SoSe_2027_–_Jubiläum.pdf")).toBe(
			"attachment; filename=\"SoSe_2027_-_Jubilaeum.pdf\"; filename*=UTF-8''SoSe_2027_%E2%80%93_Jubil%C3%A4um.pdf",
		);
	});

	test("percent-encodes characters outside attr-char", () => {
		expect(attachmentDisposition("Plan (WS) 'neu'*ü.pdf")).toBe(
			"attachment; filename=\"Plan (WS) 'neu'*ue.pdf\"; filename*=UTF-8''Plan%20%28WS%29%20%27neu%27%2A%C3%BC.pdf",
		);
	});

	test("produces values a Response accepts as a header", () => {
		const value = attachmentDisposition("Ostern 🐣 – „Fest“.pdf");
		const res = new Response(null, {
			headers: { "Content-Disposition": value },
		});
		expect(
			fileNameFromDisposition(res.headers.get("Content-Disposition")),
		).toBe("Ostern 🐣 – „Fest“.pdf");
	});
});

describe("fileNameFromDisposition", () => {
	test("round-trips names through attachmentDisposition", () => {
		for (const name of [
			"plain.pdf",
			"SoSe_2027_–_Jubiläum.pdf",
			"a'b(c)*.pdf",
		]) {
			expect(fileNameFromDisposition(attachmentDisposition(name))).toBe(name);
		}
	});

	test("reads quoted, escaped and unquoted plain filenames", () => {
		expect(
			fileNameFromDisposition('attachment; filename="a \\"b\\".pdf"'),
		).toBe('a "b".pdf');
		expect(fileNameFromDisposition("attachment; filename=plan.pdf")).toBe(
			"plan.pdf",
		);
	});

	test("falls back to filename when filename* is unusable", () => {
		expect(
			fileNameFromDisposition(
				"attachment; filename=\"x.pdf\"; filename*=UTF-8''%E2%80.pdf",
			),
		).toBe("x.pdf");
		expect(
			fileNameFromDisposition(
				"attachment; filename=\"x.pdf\"; filename*=ISO-8859-1''%E4.pdf",
			),
		).toBe("x.pdf");
	});

	test("is null without a header or file name", () => {
		expect(fileNameFromDisposition(null)).toBeNull();
		expect(fileNameFromDisposition("inline")).toBeNull();
	});
});
