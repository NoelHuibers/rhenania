// Server-rendered markup of the shared responsive list (#89): one semantic
// table whose rows turn into cards below `md`. Every row and cell is in the
// DOM once; the layout switch is CSS only.

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { DataList, type DataListColumn } from "./data-list";

type Drink = { id: string; name: string; price: string; stock: number };

const DRINKS: Drink[] = [
	{ id: "d1", name: "Pils", price: "1,50 €", stock: 24 },
	{ id: "d2", name: "Radler", price: "1,60 €", stock: 0 },
];

const COLUMNS: DataListColumn<Drink>[] = [
	{
		id: "name",
		header: "Getränk",
		cell: ({ row }) => row.original.name,
		meta: { mobile: "title" },
	},
	{
		id: "price",
		header: "Preis",
		cell: ({ row }) => row.original.price,
		meta: { mobile: "meta", className: "md:text-right" },
	},
	{
		id: "stock",
		header: () => h("span", null, "Bestand (Fl.)"),
		cell: ({ row }) => row.original.stock,
		meta: { mobile: "meta", label: "Bestand" },
	},
	{
		id: "sku",
		header: "Artikelnr.",
		cell: ({ row }) => `SKU-${row.original.id}`,
		meta: { mobile: "hidden" },
	},
	{
		id: "actions",
		header: () => h("span", { className: "sr-only" }, "Aktionen"),
		cell: ({ row }) =>
			h("button", { type: "button" }, `${row.original.name} bearbeiten`),
		meta: { mobile: "action" },
	},
];

function render(props: Partial<Parameters<typeof DataList<Drink>>[0]> = {}) {
	return renderToStaticMarkup(
		h(DataList<Drink>, {
			data: DRINKS,
			columns: COLUMNS,
			getRowId: (d) => d.id,
			caption: "Getränke",
			...props,
		}),
	);
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** Opening tag of the cell that contains `text`. */
function cellOf(html: string, text: string): string {
	const i = html.indexOf(text);
	expect(i, text).toBeGreaterThanOrEqual(0);
	const open = Math.max(html.lastIndexOf("<td", i), html.lastIndexOf("<th", i));
	return html.slice(open, html.indexOf(">", open) + 1);
}

describe("DataList", () => {
	test("renders every row and cell once", () => {
		const html = render();
		expect(count(html, "<table")).toBe(1);
		expect(count(html, 'data-slot="data-list-row"')).toBe(2);
		expect(count(html, "Radler bearbeiten")).toBe(1);
		expect(count(html, "SKU-d1")).toBe(1);
	});

	test("is a real table with headers, a caption and row headers", () => {
		const html = render();
		expect(html).toContain('<caption class="sr-only">Getränke</caption>');
		expect(html).toMatch(/<table role="table"/);
		expect(count(html, '<th scope="col" role="columnheader"')).toBe(5);
		// The title column names each row, for the table and the cards.
		expect(count(html, '<th scope="row" role="rowheader"')).toBe(2);
		expect(cellOf(html, "Pils")).toMatch(/^<th scope="row"/);
		expect(cellOf(html, "1,50 €")).toMatch(/^<td role="cell"/);
		expect(html).toContain('<span class="sr-only">Aktionen</span>');
	});

	test("below md the header is for screen readers and rows are cards", () => {
		const html = render();
		expect(html).toMatch(/<table[^>]*class="[^"]*max-md:block/);
		expect(html).toMatch(/<thead role="rowgroup" class="max-md:sr-only"/);
		expect(html).toMatch(/<tbody role="rowgroup" class="max-md:grid/);
		const row = /<tr[^>]*data-slot="data-list-row"[^>]*>/.exec(html)?.[0];
		expect(row).toMatch(/max-md:flex/);
		expect(row).toMatch(/max-md:rounded-lg/);
		expect(row).toMatch(/max-md:border/);
	});

	test("each column goes where its mobile role says", () => {
		const html = render();
		expect(cellOf(html, "Pils")).toContain("max-md:order-1");
		expect(cellOf(html, "1,50 €")).toContain("max-md:order-3");
		expect(cellOf(html, "SKU-d1")).toContain("max-md:hidden");
		expect(cellOf(html, "Pils bearbeiten")).toContain("max-md:order-4");
		// An empty action cell takes no room in the card.
		expect(cellOf(html, "Pils bearbeiten")).toContain("max-md:empty:hidden");
		// Column classes reach header and cells.
		expect(cellOf(html, "1,50 €")).toContain("md:text-right");
		expect(html).toMatch(/<th scope="col"[^>]*md:text-right[^>]*>Preis/);
	});

	test("meta cells get a visible label on phones, hidden from screen readers", () => {
		const html = render();
		// From a string header…
		expect(html).toContain(
			'<span aria-hidden="true" class="text-muted-foreground md:hidden">Preis</span>',
		);
		// …or from `meta.label` when the header is an element.
		expect(html).toContain(
			'<span aria-hidden="true" class="text-muted-foreground md:hidden">Bestand</span>',
		);
		expect(count(html, ">Preis</span>")).toBe(2);
		// Title, hidden and action cells have no label.
		expect(html).not.toMatch(/aria-hidden="true"[^>]*>Getränk</);
		expect(html).not.toMatch(/aria-hidden="true"[^>]*>Artikelnr\./);
	});

	test("the grid layout puts two meta cells per line", () => {
		const rows = render();
		const grid = render({ metaLayout: "grid" });
		expect(cellOf(rows, "1,50 €")).toContain("max-md:basis-full");
		expect(cellOf(grid, "1,50 €")).toContain("max-md:basis-1/2");
		expect(grid).toContain(
			'<span aria-hidden="true" class="text-muted-foreground md:hidden text-xs">Preis</span>',
		);
	});

	test("hidden columns are left out everywhere", () => {
		const html = render({ columnVisibility: { sku: false } });
		expect(html).not.toContain("Artikelnr.");
		expect(html).not.toContain("SKU-d1");
		expect(count(html, '<th scope="col"')).toBe(4);
	});

	test("row classes can depend on the row", () => {
		const html = render({
			rowClassName: (d) => (d.stock === 0 ? "bg-warning-muted" : undefined),
		});
		const rows = [
			...html.matchAll(/<tr[^>]*data-slot="data-list-row"[^>]*>/g),
		].map((m) => m[0]);
		expect(rows).toHaveLength(2);
		expect(rows[0]).not.toContain("bg-warning-muted");
		expect(rows[1]).toContain("bg-warning-muted");
	});

	test("shows the empty state instead of an empty table", () => {
		const html = render({
			data: [],
			empty: h("p", null, "Keine Getränke"),
		});
		expect(html).toBe("<p>Keine Getränke</p>");
	});

	test("container and table props pass through", () => {
		const html = render({
			className: "md:rounded-md md:border",
			containerProps: { role: "region", "aria-label": "Getränkeliste" },
			tableProps: { "aria-describedby": "hint" },
		});
		expect(html).toMatch(
			/^<div data-slot="data-list" role="region" aria-label="Getränkeliste" class="[^"]*md:rounded-md md:border"/,
		);
		expect(html).toMatch(/<table role="table" aria-describedby="hint"/);
	});
});
