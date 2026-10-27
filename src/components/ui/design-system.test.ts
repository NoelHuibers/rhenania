// Server-rendered markup of the shared tabs, chips, bars and tiles (#87).
// Keyboard behaviour (arrow keys, roving focus) comes from Radix and is
// exercised in the browser by the E2E and axe runs.

import { createElement as h, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BillingSelector } from "~/components/trinken/drinks/Billingselector";
import { ChipGroup } from "./chip-group";
import { SectionCard } from "./section-card";
import { BarLegend, StackedBar } from "./stacked-bar";
import { StatTile } from "./stat-tile";
import { TabsContent, TabsList, TabsTrigger, UrlTabs } from "./tabs";

const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
	useSearchParams: () => new URLSearchParams(search.value),
}));

const render = (el: ReactElement) => renderToStaticMarkup(el);

/** Opening tag of the first element that has `attr`. */
function tagWith(html: string, attr: string): string {
	const i = html.indexOf(attr);
	expect(i, attr).toBeGreaterThanOrEqual(0);
	return html.slice(html.lastIndexOf("<", i), html.indexOf(">", i) + 1);
}

/** Opening tags of all role="radio" elements, in order. */
function radios(html: string): string[] {
	return [...html.matchAll(/<button[^>]*role="radio"[^>]*>/g)].map((m) => m[0]);
}

describe("Tabs", () => {
	const TABS = ["getraenke", "inventur", "kasse"] as const;
	const page = () =>
		render(
			h(
				UrlTabs,
				{ values: TABS, defaultValue: "getraenke" },
				h(
					TabsList,
					null,
					TABS.map((t) => h(TabsTrigger, { key: t, value: t }, t)),
				),
				TABS.map((t) => h(TabsContent, { key: t, value: t }, `Inhalt ${t}`)),
			),
		);
	const selected = (html: string) =>
		/<button[^>]*aria-selected="true"[^>]*>([^<]*)</.exec(html)?.[1];

	beforeEach(() => {
		search.value = "";
	});

	test("the tab list scrolls sideways instead of squeezing its tabs", () => {
		const list = tagWith(page(), 'role="tablist"');
		expect(list).toContain('data-layout="scroll"');
		expect(list).toMatch(/max-w-full/);
		expect(list).toMatch(/overflow-x-auto/);
		expect(list).toMatch(/snap-x/);
		// Triggers keep their width in a scrolling list.
		expect(tagWith(page(), 'role="tab"')).toMatch(
			/group-data-\[layout=scroll\]\/tabs-list:flex-none/,
		);
	});

	test("fill layout shares the full width", () => {
		const html = render(
			h(
				UrlTabs,
				{ values: ["a", "b"], defaultValue: "a" },
				h(
					TabsList,
					{ layout: "fill" },
					h(TabsTrigger, { value: "a" }, "A"),
					h(TabsTrigger, { value: "b" }, "B"),
				),
			),
		);
		const list = tagWith(html, 'role="tablist"');
		expect(list).toContain('data-layout="fill"');
		expect(list).toMatch(/w-full/);
		expect(list).not.toMatch(/overflow-x-auto/);
	});

	test("UrlTabs shows the tab named in ?tab=", () => {
		search.value = "tab=inventur&etaplan=x";
		const html = page();
		expect(selected(html)).toBe("inventur");
		expect(html).toContain("Inhalt inventur");
		expect(html).not.toContain("Inhalt getraenke");
	});

	test("UrlTabs falls back to the default for missing or unknown tabs", () => {
		expect(selected(page())).toBe("getraenke");
		// e.g. ?tab=beitraege for someone who does not see that tab
		search.value = "tab=beitraege";
		expect(selected(page())).toBe("getraenke");
	});

	test("UrlTabs can use another search parameter", () => {
		search.value = "tab=kasse&ansicht=inventur";
		const html = render(
			h(
				UrlTabs,
				{ param: "ansicht", values: TABS, defaultValue: "getraenke" },
				h(
					TabsList,
					null,
					TABS.map((t) => h(TabsTrigger, { key: t, value: t }, t)),
				),
			),
		);
		expect(selected(html)).toBe("inventur");
	});
});

describe("ChipGroup", () => {
	const options = [
		{ value: "offen", label: "Offen", count: 3 },
		{ value: "alle", label: "Alle" },
	] as const;
	const chips = (props: { size?: "lg"; bleed?: boolean } = {}) =>
		render(
			h(ChipGroup<"offen" | "alle">, {
				"aria-label": "Anträge filtern",
				options,
				value: "offen",
				onValueChange: () => {},
				...props,
			}),
		);

	test("is a labelled radio group with one checked chip", () => {
		const html = chips();
		const group = tagWith(html, 'role="radiogroup"');
		expect(group).toContain('aria-label="Anträge filtern"');
		const [offen, alle] = radios(html);
		expect(offen).toContain('aria-checked="true"');
		expect(alle).toContain('aria-checked="false"');
		expect(html).toMatch(/Offen<span[^>]*>3<\/span>/);
	});

	test("default chips are 36 px with a 44 px hit area, lg chips 44 px", () => {
		const [chip] = radios(chips());
		expect(chip).toMatch(/\bh-9\b/);
		expect(chip).toMatch(/after:h-11/);
		const [large] = radios(chips({ size: "lg" }));
		expect(large).toMatch(/\bh-11\b/);
		expect(large).not.toMatch(/after:h-11/);
	});

	test("the row scrolls instead of wrapping", () => {
		const group = tagWith(chips(), 'role="radiogroup"');
		expect(group).toMatch(/overflow-x-auto/);
		expect(group).not.toMatch(/flex-wrap/);
		expect(tagWith(chips({ bleed: true }), 'role="radiogroup"')).toMatch(
			/-mx-4/,
		);
	});
});

describe("BillingSelector", () => {
	const selector = (
		selectedBilling: Parameters<typeof BillingSelector>[0]["selectedBilling"],
	) =>
		render(h(BillingSelector, { selectedBilling, onBillingChange: () => {} }));
	const checked = (html: string) =>
		radios(html)
			.filter((r) => r.includes('aria-checked="true"'))
			.map((r) => html.slice(html.indexOf(r) + r.length).split("<")[0]);

	test("no account means a personal order, shown as the checked chip", () => {
		const html = selector(null);
		expect(checked(html)).toEqual(["Privat"]);
		const group = tagWith(html, 'role="radiogroup"');
		const labelId = /aria-labelledby="([^"]+)"/.exec(group)?.[1];
		expect(html).toContain(
			`id="${labelId}" class="mb-1.5 text-muted-foreground text-xs">Auf ein Konto buchen (optional)`,
		);
	});

	test("a common account is checked as a 44 px chip", () => {
		const html = selector("AKN");
		expect(checked(html)).toEqual(["AKN"]);
		for (const r of radios(html)) {
			expect(r).toMatch(/\bh-11\b/);
		}
	});

	test("a rare account from 'Weitere' joins the chips while selected", () => {
		expect(selector(null)).not.toContain(">Stiftungsfest<");
		const html = selector("Stiftungsfest");
		expect(checked(html)).toEqual(["Stiftungsfest"]);
		expect(html).toContain("Weitere");
	});
});

describe("StackedBar and BarLegend", () => {
	test("parts are scaled to the limit and hidden from screen readers", () => {
		const html = render(
			h(StackedBar, {
				max: 200,
				segments: [
					{ value: 50, swatch: "solid" },
					{ value: 50, swatch: "soft" },
				],
			}),
		);
		expect(html).toContain('aria-hidden="true"');
		expect(html).not.toContain('role="img"');
		expect(html).toContain("width:25%");
		expect((html.match(/width:25%/g) ?? []).length).toBe(2);
		expect(html).not.toContain("left:");
	});

	test("over the limit: scaled to the total, notch at the limit, danger tone", () => {
		const html = render(
			h(StackedBar, {
				max: 100,
				tone: "danger",
				label: "150 € von 100 € ausgegeben",
				segments: [
					{ value: 150, swatch: "solid" },
					{ value: 50, swatch: "hatched" },
				],
			}),
		);
		expect(html).toContain('role="img"');
		expect(html).toContain('aria-label="150 € von 100 € ausgegeben"');
		expect(html).toContain("width:75%");
		expect(html).toContain("left:50%");
		expect(html).toMatch(/bg-danger/);
		// The hatching is a theme token, not a raw palette colour.
		expect(html).toContain("var(--color-warning)");
	});

	test("the legend names every part with its value", () => {
		const html = render(
			h(BarLegend, {
				items: [
					{ label: "Ausgezahlt", value: "10,00 €", swatch: "solid" },
					{ label: "Eingereicht", value: "5,00 €", swatch: "hatched" },
				],
			}),
		);
		expect(html.match(/<li/g)).toHaveLength(2);
		expect(html).toContain("Ausgezahlt");
		expect(html).toContain("5,00 €");
		expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
	});
});

describe("StatTile and SectionCard", () => {
	test("a tile shows label, value, hint and a decorative icon", () => {
		const html = render(
			h(
				StatTile,
				{
					icon: h("svg", { "data-icon": "piggy" }),
					label: "Einnahmen",
					value: "1.200,00 €",
					hint: "von 2.000,00 € geplant",
					tone: "success",
				},
				h("progress"),
			),
		);
		expect(html).toMatch(/aria-hidden="true"[^>]*><svg data-icon="piggy"/);
		expect(html).toContain("Einnahmen");
		expect(html).toMatch(/text-success[^>]*>1\.200,00 €/);
		expect(html).toContain("von 2.000,00 € geplant");
		expect(html).toContain("<progress>");
	});

	test("a section card has a heading, a summary line and an aside", () => {
		const html = render(
			h(
				SectionCard,
				{
					title: "Veranstaltungen",
					headingLevel: 2,
					meta: "120,00 € von 300,00 €",
					aside: "180,00 €",
				},
				h("ul", null, h("li", null, "Kneipe")),
			),
		);
		expect(html).toMatch(/^<section/);
		expect(html).toMatch(/<h2[^>]*>Veranstaltungen<\/h2>/);
		expect(html).toContain("120,00 € von 300,00 €");
		expect(html).toContain("180,00 €");
		expect(html).toContain("<li>Kneipe</li>");
	});
});
