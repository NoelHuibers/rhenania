// Server-rendered markup of the members table (#88): every cell is named by
// column and member, the table has real headers, and save results have a
// live region. The save logic itself is in member-edits.test.ts.

import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import type { MemberListItem } from "~/server/actions/members/members";
import { MembersTable } from "./MembersTable";

vi.mock("next/navigation", () => ({
	useRouter: () => ({ refresh: () => {} }),
}));
vi.mock("~/server/actions/members/members", () => ({
	updateMemberFields: vi.fn(),
}));

function member(
	id: string,
	lastName: string,
	firstName: string,
	extra: Partial<MemberListItem> = {},
): MemberListItem {
	return {
		id,
		lastName,
		firstName,
		status: "Aktivitas",
		email: null,
		street: null,
		city: null,
		lettersOptOut: false,
		addressNeedsUpdate: false,
		forwarding: false,
		linked: false,
		...extra,
	} as MemberListItem;
}

const MEMBERS = [
	member("m1", "Müller", "Max", { street: "Hauptstr.", city: "Bonn" }),
	member("m2", "Schmidt", "Eva", { email: "eva@example.de", forwarding: true }),
];

function render(canEdit = true) {
	return renderToStaticMarkup(
		h(MembersTable, {
			members: MEMBERS,
			canEdit,
			onEditFull: () => {},
			onRequestDelete: () => {},
		}),
	);
}

/** Desktop table only (the phone cards repeat names and links). */
function table(html: string): string {
	return html.slice(html.indexOf("<table"), html.indexOf("</table>"));
}

const inputs = (html: string) =>
	[...table(html).matchAll(/<input[^>]*>/g)]
		.map((m) => m[0])
		// Radix check boxes add a hidden native input for forms.
		.filter((i) => !i.includes('aria-hidden="true"'));

describe("MembersTable (#88)", () => {
	test("every editable text cell is named by column and member", () => {
		const html = render();
		const cells = inputs(html);
		// Default columns: E-Mail, Mobil, Straße, PLZ, Ort per member.
		expect(cells).toHaveLength(10);
		for (const cell of cells) {
			expect(cell).toMatch(/aria-label="[^"]+ – (Müller, Max|Schmidt, Eva)"/);
		}
		expect(html).toContain('aria-label="Straße – Müller, Max"');
		expect(html).toContain('aria-label="E-Mail – Schmidt, Eva"');
		expect(table(html)).toContain('value="Hauptstr."');
	});

	test("status cells and check boxes are named too", () => {
		const html = table(render());
		expect(html).toContain('aria-label="Abteilung – Müller, Max: Aktivitas"');
		expect(html).toContain('aria-label="Weiterleitung – Schmidt, Eva"');
		expect(html).toContain('aria-label="Adresse veraltet – Müller, Max"');
		expect(html).toContain('aria-label="Nur E-Mail – Müller, Max"');
		const forwarding =
			/<button[^>]*aria-label="Weiterleitung – Schmidt, Eva"[^>]*>/.exec(
				html,
			)?.[0];
		expect(forwarding).toContain('aria-checked="true"');
	});

	test("column headers and the member column are table headers", () => {
		const html = table(render());
		expect(html).toContain('<caption class="sr-only">Mitglieder</caption>');
		expect(html.match(/<th scope="col"/g)?.length).toBeGreaterThanOrEqual(8);
		expect(html.match(/<th scope="row"/g)).toHaveLength(2);
		expect(html).toMatch(/<th scope="row"[\s\S]*?Müller, Max/);
		// The actions column has a name even though it shows none.
		expect(html).toContain('<span class="sr-only">Aktionen</span>');
	});

	test("row actions say which member they act on", () => {
		const html = table(render());
		expect(html).toContain('aria-label="Müller, Max bearbeiten"');
		expect(html).toContain('aria-label="Schmidt, Eva löschen"');
	});

	test("saving is explicit and its result is announced", () => {
		const html = render();
		expect(html).toMatch(/<div role="status" aria-live="polite"/);
		expect(html).toContain("<kbd>Enter</kbd> speichert");
		expect(html).toMatch(/<table[^>]*aria-describedby="[^"]+"/);
		// Nothing pending on first render: no save bar.
		expect(html).not.toContain("members-save-bar");
		expect(html).not.toContain("ungespeicherte");
	});

	test("the toolbar controls are labelled", () => {
		const html = render();
		expect(html).toContain('aria-label="Mitglieder suchen"');
		expect(html).toContain('aria-label="Nach Abteilung filtern"');
		expect(html).toContain("2 von 2 Mitgliedern");
	});

	test("read-only users get disabled, still named cells and no hint", () => {
		const html = render(false);
		for (const cell of inputs(html)) {
			expect(cell).toContain('disabled=""');
			expect(cell).toMatch(/aria-label="[^"]+ – [^"]+"/);
		}
		expect(html).not.toContain("<kbd>Enter</kbd>");
		expect(table(html)).not.toContain("bearbeiten");
	});
});
