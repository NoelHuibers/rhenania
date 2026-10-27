// Server-rendered markup of the ordering screen (#74). There is no DOM in
// the unit tests; the tap flow itself is covered by e2e/trinken-mobile.spec.ts.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { MenuItem } from "~/server/actions/menu";
import { DrinkButton } from "./DrinkButton";
import { DrinksMenu } from "./DrinksMenu";

function drink(
	id: string,
	name: string,
	price: number,
	isCurrentlyAvailable = true,
): MenuItem {
	return {
		id,
		name,
		price,
		isCurrentlyAvailable,
		kastengroesse: null,
		volume: null,
		picture: null,
		createdAt: new Date(0),
		updatedAt: null,
	};
}

const MENU = [
	drink("pils", "Pils", 1.2),
	drink("weizen", "Weizen", 1.5),
	drink("radler", "Radler", 1.2, false),
];

function render(props: Partial<Parameters<typeof DrinksMenu>[0]> = {}) {
	return renderToStaticMarkup(
		createElement(DrinksMenu, {
			drinks: MENU,
			markupPercent: 0,
			recentDrinkIds: [],
			...props,
		}),
	);
}

/** Opening tags of all <button> elements whose text contains `text`. */
function buttonsWith(html: string, text: string): string[] {
	return [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)]
		.map((m) => m[0])
		.filter((b) => b.includes(text));
}

describe("DrinksMenu", () => {
	test("every drink is one large button with its price", () => {
		const html = render();
		const [pils] = buttonsWith(html, ">Pils<");
		expect(pils).toBeDefined();
		expect(pils).toMatch(/min-h-16/);
		expect(pils).toMatch(/1,20\s€/);
		expect(pils).not.toMatch(/ disabled=""/);
	});

	test("prices include the markup on personal orders", () => {
		const html = render({ markupPercent: 10 });
		expect(buttonsWith(html, ">Pils<")[0]).toMatch(/1,32\s€/);
	});

	test("unavailable drinks are folded away and disabled", () => {
		const html = render();
		expect(html).toContain("Nicht verfügbar (1)");
		// Collapsed: the Radler button is not in the closed content.
		expect(buttonsWith(html, ">Radler<")).toEqual([]);
	});

	test("recently ordered drinks come first as shortcuts", () => {
		const html = render({ recentDrinkIds: ["weizen", "radler"] });
		expect(html).toContain("Zuletzt bestellt");
		const weizen = buttonsWith(html, ">Weizen<");
		expect(weizen).toHaveLength(2); // shortcut + menu row
		expect(weizen[0]).toMatch(/min-h-14/);
		expect(html.indexOf("Zuletzt bestellt")).toBeLessThan(
			html.indexOf('id="trinken-menu"'),
		);
	});

	test("no shortcut row without recent orders, no account bar by default", () => {
		const html = render();
		expect(html).not.toContain("Zuletzt bestellt");
		expect(html).not.toContain("Buchung auf");
	});

	test("the account chips are 44 px touch targets", () => {
		const html = render();
		for (const account of ["CC", "AKN", "CBesuch", "Weitere"]) {
			const [chip] = buttonsWith(html, account);
			expect(chip, account).toMatch(/h-11/);
		}
	});

	test("an empty menu shows the empty state", () => {
		expect(render({ drinks: [] })).toContain("Keine Getränke verfügbar");
	});
});

describe("DrinkButton", () => {
	test("an unavailable drink is a disabled button without a price", () => {
		const html = renderToStaticMarkup(
			createElement(DrinkButton, {
				drink: drink("radler", "Radler", 1.2, false),
				onSelect: () => {},
			}),
		);
		expect(html).toMatch(/<button[^>]* disabled=""/);
		expect(html).toContain("Nicht verfügbar");
		expect(html).not.toMatch(/1,20\s€/);
	});
});
