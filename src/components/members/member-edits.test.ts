// Bookkeeping behind the explicit save in the members table (#88).

import { describe, expect, test } from "vitest";

import {
	BOOL_COLS,
	type Change,
	cellId,
	cellLabel,
	columnLabel,
	failedMessage,
	inverse,
	leftUnsavedMessage,
	memberName,
	patchesByMember,
	pendingMessage,
	savedMessage,
	TEXT_COLS,
	withDraft,
	withoutDrafts,
} from "./member-edits";

const MAX = { lastName: "Müller", firstName: "Max" };

const street: Change = {
	id: "m1",
	key: "street",
	member: "Müller, Max",
	from: "Alte Str.",
	to: "Neue Str.",
};
const city: Change = {
	id: "m1",
	key: "city",
	member: "Müller, Max",
	from: "Bonn",
	to: "Köln",
};
const forwarding: Change = {
	id: "m2",
	key: "forwarding",
	member: "Schmidt, Eva",
	from: false,
	to: true,
};

describe("cell names", () => {
	test("a cell is named by its column and the member", () => {
		expect(cellLabel("Straße", MAX)).toBe("Straße – Müller, Max");
		expect(memberName({ lastName: "Müller", firstName: "" })).toBe("Müller");
	});

	test("every column has a readable name, abbreviations spelled out", () => {
		expect(columnLabel("status")).toBe("Abteilung");
		expect(columnLabel("street")).toBe("Straße");
		expect(columnLabel("forwarding")).toBe("Weiterleitung");
		expect(columnLabel("addressNeedsUpdate")).toBe("Adresse veraltet");
		for (const c of [...TEXT_COLS, ...BOOL_COLS]) {
			expect(columnLabel(c.key), c.key).not.toBe(c.key);
		}
	});
});

describe("drafts", () => {
	test("an edit is kept until saved; editing back to the saved value drops it", () => {
		let drafts = withDraft({}, street);
		expect(Object.keys(drafts)).toEqual([cellId("m1", "street")]);
		drafts = withDraft(drafts, { ...street, to: "Alte Str." });
		expect(drafts).toEqual({});
	});

	test("a save only clears the drafts it saved, not newer edits", () => {
		const drafts = withDraft(withDraft({}, street), city);
		const newer = withDraft(drafts, { ...city, to: "Köln-Deutz" });
		const left = withoutDrafts(newer, [street, city]);
		expect(Object.values(left)).toEqual([{ ...city, to: "Köln-Deutz" }]);
	});

	test("one patch per member, in the shape updateMemberFields takes", () => {
		const patches = patchesByMember([street, city, forwarding]);
		expect([...patches]).toEqual([
			["m1", { street: "Neue Str.", city: "Köln" }],
			["m2", { forwarding: true }],
		]);
	});

	test("undo saves the old values back", () => {
		expect(inverse([street, forwarding])).toEqual([
			{ ...street, from: "Neue Str.", to: "Alte Str." },
			{ ...forwarding, from: true, to: false },
		]);
	});
});

describe("messages", () => {
	test("pending edits are counted", () => {
		expect(pendingMessage(1)).toBe("1 ungespeicherte Änderung");
		expect(pendingMessage(3)).toBe("3 ungespeicherte Änderungen");
	});

	test("leaving an edited cell says it is not saved", () => {
		expect(leftUnsavedMessage(street)).toBe(
			"Straße – Müller, Max: Änderung noch nicht gespeichert.",
		);
	});

	test("a single save names the cell and the new value", () => {
		expect(savedMessage([street])).toBe(
			"Gespeichert: Straße – Müller, Max: „Neue Str.“",
		);
		expect(savedMessage([{ ...street, to: "  " }])).toBe(
			"Gespeichert: Straße – Müller, Max: leer",
		);
		expect(savedMessage([forwarding])).toBe(
			"Gespeichert: Weiterleitung – Schmidt, Eva: an",
		);
		expect(savedMessage(inverse([forwarding]), true)).toBe(
			"Rückgängig gemacht: Weiterleitung – Schmidt, Eva: aus",
		);
	});

	test("several saves are counted", () => {
		expect(savedMessage([street, city])).toBe("Gespeichert: 2 Änderungen");
	});

	test("a failure names the first cell and the server's reason", () => {
		expect(failedMessage([])).toBe("");
		expect(
			failedMessage([{ change: street, error: "Keine Berechtigung" }]),
		).toBe("Nicht gespeichert: Straße – Müller, Max. Keine Berechtigung");
		expect(
			failedMessage([
				{ change: street, error: "Ungültige E-Mail" },
				{ change: city, error: "Ungültige E-Mail" },
			]),
		).toBe(
			"Nicht gespeichert: Straße – Müller, Max und 1 weiteres Feld. Ungültige E-Mail",
		);
	});
});
