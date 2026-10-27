// Inline edits in the members table (#88): which cells are editable, how
// each cell is named for screen readers, and the bookkeeping for explicit
// saves, results and undo. Pure, so it is unit-tested without a DOM.

export type TextKey =
	| "title"
	| "email"
	| "email2"
	| "email3"
	| "mobile"
	| "phonePrivate"
	| "phonePrivate2"
	| "phoneWork"
	| "phoneWork2"
	| "street"
	| "houseNumber"
	| "postalCode"
	| "city"
	| "country"
	| "birthday"
	| "company"
	| "notes";

export type BoolKey = "lettersOptOut" | "addressNeedsUpdate" | "forwarding";

export type EditableKey = TextKey | BoolKey | "status";

export type CellValue = string | boolean;

export const TEXT_COLS: {
	key: TextKey;
	header: string;
	w: string;
	border?: boolean;
}[] = [
	{ key: "title", header: "Position", w: "min-w-[130px]" },
	{ key: "email", header: "E-Mail", w: "min-w-[210px]", border: true },
	{ key: "email2", header: "E-Mail 2", w: "min-w-[190px]" },
	{ key: "email3", header: "E-Mail 3", w: "min-w-[190px]" },
	{ key: "mobile", header: "Mobil", w: "min-w-[150px]" },
	{ key: "phonePrivate", header: "Tel. privat", w: "min-w-[150px]" },
	{ key: "phonePrivate2", header: "Tel. privat 2", w: "min-w-[150px]" },
	{ key: "phoneWork", header: "Tel. gesch.", w: "min-w-[150px]" },
	{ key: "phoneWork2", header: "Tel. gesch. 2", w: "min-w-[150px]" },
	{ key: "street", header: "Straße", w: "min-w-[190px]", border: true },
	{ key: "houseNumber", header: "Nr.", w: "min-w-[70px]" },
	{ key: "postalCode", header: "PLZ", w: "min-w-[80px]" },
	{ key: "city", header: "Ort", w: "min-w-[150px]" },
	{ key: "country", header: "Land", w: "min-w-[120px]" },
	{ key: "birthday", header: "Geburtstag", w: "min-w-[120px]", border: true },
	{ key: "company", header: "Firma", w: "min-w-[180px]" },
	{ key: "notes", header: "Notizen", w: "min-w-[200px]" },
];

/** `header` is the short column title, `label` the full name read out. */
export const BOOL_COLS: {
	key: BoolKey;
	header: string;
	label: string;
	border?: boolean;
}[] = [
	{
		key: "lettersOptOut",
		header: "Nur E-Mail",
		label: "Nur E-Mail",
		border: true,
	},
	{ key: "addressNeedsUpdate", header: "Veraltet", label: "Adresse veraltet" },
	{ key: "forwarding", header: "Weiterl.", label: "Weiterleitung" },
];

export const STATUS_COLUMN = "Abteilung";

/** Full column name for messages and accessible names. */
export function columnLabel(key: EditableKey): string {
	if (key === "status") {
		return STATUS_COLUMN;
	}
	return (
		TEXT_COLS.find((c) => c.key === key)?.header ??
		BOOL_COLS.find((c) => c.key === key)?.label ??
		key
	);
}

type Named = { lastName: string; firstName: string };

export function memberName(m: Named): string {
	return m.firstName ? `${m.lastName}, ${m.firstName}` : m.lastName;
}

/** Accessible name of a cell: column and member, e.g. "Straße – Müller, Max". */
export function cellLabel(column: string, m: Named): string {
	return `${column} – ${memberName(m)}`;
}

/** One edited cell: the saved value and the value to save. */
export type Change = {
	id: string;
	key: EditableKey;
	member: string;
	from: CellValue;
	to: CellValue;
};

export const cellId = (id: string, key: EditableKey) => `${id}:${key}`;

/** Drafts that would change nothing are dropped. */
export function withDraft(
	drafts: Record<string, Change>,
	change: Change,
): Record<string, Change> {
	const next = { ...drafts };
	const k = cellId(change.id, change.key);
	if (change.to === change.from) {
		delete next[k];
	} else {
		next[k] = change;
	}
	return next;
}

export function withoutDrafts(
	drafts: Record<string, Change>,
	changes: readonly Change[],
): Record<string, Change> {
	const next = { ...drafts };
	for (const c of changes) {
		const k = cellId(c.id, c.key);
		// Only drop the draft that was saved, not a newer edit of that cell.
		if (next[k]?.to === c.to) {
			delete next[k];
		}
	}
	return next;
}

/** One patch per member, the shape `updateMemberFields(id, patch)` takes. */
export function patchesByMember(
	changes: readonly Change[],
): Map<string, Record<string, CellValue>> {
	const out = new Map<string, Record<string, CellValue>>();
	for (const c of changes) {
		const patch = out.get(c.id) ?? {};
		patch[c.key] = c.to;
		out.set(c.id, patch);
	}
	return out;
}

/** The changes that put the old values back. */
export function inverse(changes: readonly Change[]): Change[] {
	return changes.map((c) => ({ ...c, from: c.to, to: c.from }));
}

/** "Straße – Müller, Max" for a change. */
function where(c: Change): string {
	return `${columnLabel(c.key)} – ${c.member}`;
}

function describe(c: Change): string {
	if (typeof c.to === "boolean") {
		return `${where(c)}: ${c.to ? "an" : "aus"}`;
	}
	const value = c.to.trim() === "" ? "leer" : `„${c.to.trim()}“`;
	return `${where(c)}: ${value}`;
}

const plural = (n: number, one: string, many: string) =>
	`${n} ${n === 1 ? one : many}`;

export function pendingMessage(n: number): string {
	return plural(n, "ungespeicherte Änderung", "ungespeicherte Änderungen");
}

/** Said when the user leaves an edited cell without saving it. */
export function leftUnsavedMessage(c: Change): string {
	return `${where(c)}: Änderung noch nicht gespeichert.`;
}

export function savedMessage(changes: readonly Change[], undo = false): string {
	const verb = undo ? "Rückgängig gemacht" : "Gespeichert";
	const [only] = changes;
	if (changes.length === 1 && only) {
		return `${verb}: ${describe(only)}`;
	}
	return `${verb}: ${plural(changes.length, "Änderung", "Änderungen")}`;
}

export function failedMessage(
	failures: readonly { change: Change; error: string }[],
): string {
	const [first] = failures;
	if (!first) {
		return "";
	}
	const more =
		failures.length > 1
			? ` und ${plural(failures.length - 1, "weiteres Feld", "weitere Felder")}`
			: "";
	return `Nicht gespeichert: ${where(first.change)}${more}. ${first.error}`;
}
