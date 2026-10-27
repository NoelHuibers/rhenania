// Server-rendered markup of the open-bill card and banner (#80).

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { OpenBill } from "~/server/lib/open-bill";
import { OpenBillCard } from "./OpenBillCard";

const BILL: OpenBill = {
	billId: "bill-1",
	billNumber: "KW-43-26",
	total: 23.4,
	dueDate: "2026-11-05",
	reference: "Max - Rechnung KW-43-26",
	payment: {
		iban: "DE89 3704 0044 0532 0130 00",
		ibanRaw: "DE89370400440532013000",
		accountHolder: "Corps Test e.V.",
		paypalBaseUrl: "https://paypal.me/TestKasse",
	},
};

function render(bill: OpenBill, variant?: "banner" | "card") {
	return renderToStaticMarkup(createElement(OpenBillCard, { bill, variant }));
}

function bezahlen(html: string): string | undefined {
	return [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)]
		.map((m) => m[0])
		.find((b) => b.includes("Bezahlen"));
}

describe("OpenBillCard", () => {
	test("shows amount, bill, due date and a large Bezahlen button", () => {
		const html = render(BILL);
		expect(html).toContain('aria-label="Offene Getränkerechnung"');
		expect(html).toMatch(/23,40\s€/);
		expect(html).toContain("Rechnung KW-43-26 · fällig bis 05.11.2026");
		expect(html).toContain("Unbezahlt");
		expect(bezahlen(html)).toMatch(/h-12/);
	});

	test("the banner on /trinken is compact but keeps a 44 px button", () => {
		const html = render(BILL, "banner");
		expect(html).toMatch(/23,40\s€/);
		expect(bezahlen(html)).toMatch(/h-11/);
	});

	test("without payment data: the amount and the hint, no pay button", () => {
		for (const variant of ["card", "banner"] as const) {
			const html = render({ ...BILL, payment: null }, variant);
			expect(html).toMatch(/23,40\s€/);
			expect(html).toContain("Zahlungsdaten nicht hinterlegt");
			expect(bezahlen(html)).toBeUndefined();
		}
	});

	test("no due date line part when the Kasse has no payment terms", () => {
		const html = render({ ...BILL, dueDate: null });
		expect(html).toContain("Rechnung KW-43-26<");
		expect(html).not.toContain("fällig");
	});
});
