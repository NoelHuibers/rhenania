import { createElement, isValidElement, type ReactNode } from "react";
import { describe, expect, test } from "vitest";

import { semproProfile } from "~/server/lib/tenant-profile";
import type { PDFData } from "./getPDFData";
import { SemProPDFDocument } from "./SemProPDF";

const DATA: PDFData = {
	semesterName: "Wintersemester 2026",
	startDate: new Date("2026-10-12T00:00:00Z"),
	endDate: new Date("2027-02-14T00:00:00Z"),
	leaders: [{ name: "Sepp", role: "Senior" }],
	ccKonto: null,
	jourFixeRule: null,
	stammtischRule: null,
	events: [],
};

type Props = { children?: ReactNode; [key: string]: unknown };

/** Every text the document draws plus its props, function components expanded. */
function walk(node: ReactNode, out: { texts: string[]; props: Props[] }) {
	if (typeof node === "string" || typeof node === "number") {
		out.texts.push(String(node));
		return out;
	}
	if (Array.isArray(node)) {
		for (const child of node) {
			walk(child, out);
		}
		return out;
	}
	if (!isValidElement<Props>(node)) {
		return out;
	}
	if (typeof node.type === "function") {
		walk((node.type as (p: Props) => ReactNode)(node.props), out);
		return out;
	}
	out.props.push(node.props);
	walk(node.props.children, out);
	return out;
}

function render(branding: Parameters<typeof semproProfile>[0]) {
	return walk(
		createElement(SemProPDFDocument, {
			data: DATA,
			wappenPath: null,
			qrDataUrl: null,
			sempro: semproProfile(branding),
		}),
		{ texts: [], props: [] },
	);
}

describe("SemPro PDF letterhead (#36)", () => {
	test("another Corps gets its own name and address, nothing of Rhenania", () => {
		const out = render({
			displayName: "Corps Hassia Darmstadt",
			branding: {
				street: "Musterweg 5",
				city: "64283 Darmstadt",
				contactEmail: "cc@hassia.example",
			},
		});
		const all = out.texts.join("\n");

		expect(out.texts).toContain("Corps Hassia Darmstadt");
		expect(out.texts).toContain("Musterweg 5");
		expect(out.texts).toContain("64283 Darmstadt");
		expect(out.texts).toContain("cc@hassia.example");
		expect(out.texts).toContain("Jour Fixe und Stammtisch");
		expect(all).toContain("Zum Wintersemester 2026 erlaubt\nsich der CC, das");
		expect(all).not.toMatch(/rhenan|stuttgart|relenberg/i);
		expect(out.props.find((p) => "author" in p)?.author).toBe(
			"Corps Hassia Darmstadt",
		);
	});

	test("a tenant without branding gets neutral texts and no address", () => {
		const out = render({ displayName: "Corps Neu", branding: null });
		expect(out.texts).toContain("Corps Neu");
		expect(out.texts.join("\n")).not.toMatch(/rhenan|stuttgart|@/i);
	});

	test("Rhenania's stored branding reproduces its letterhead", () => {
		const out = render({
			displayName: "Corps Rhenania Stuttgart",
			branding: {
				legalName: "Corps Rhenania zu Stuttgart",
				sempro: {
					name: "Corps Rhenania",
					intro:
						"Zum {semester} erlaubt\nsich der CC der Rhenania sein\nSemesterprogramm zu überreichen\nund zu allen Veranstaltungen herzlich\neinzuladen.",
					contactLines: [
						"Relenbergstraße 8",
						"70174 Stuttgart",
						"Tel.: +49 (0) 711 29 73 08",
						"Fax: +49 (0) 711 29 53 66",
						"cc@rhenania-stuttgart.de",
					],
					stammtischName: "Rhenanenstammtisch",
				},
			},
		});

		expect(out.texts).toContain("Corps Rhenania");
		expect(out.texts).toContain("Fax: +49 (0) 711 29 53 66");
		expect(out.texts).toContain("Jour Fixe und Rhenanenstammtisch");
		expect(out.texts).toContain(
			"Zum Wintersemester 2026 erlaubt\nsich der CC der Rhenania sein\nSemesterprogramm zu überreichen\nund zu allen Veranstaltungen herzlich\neinzuladen.",
		);
		expect(out.props.find((p) => "author" in p)?.author).toBe(
			"Corps Rhenania zu Stuttgart",
		);
	});
});
