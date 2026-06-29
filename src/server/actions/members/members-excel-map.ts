// Column map for the member Adressliste Excel, matched to the real export
// (Corpsverzeichnis). Import matches columns by HEADER text (robust to column
// reordering); export writes them in this order. Unmapped source columns are
// preserved losslessly in `members.extra` keyed by their header.

export const SHEET_NAME = "Adressliste";
export const HEADER_ROW = 1;
export const BODY_START_ROW = 2;

export type ColKind = "string" | "bool" | "date";

export type MemberField =
	| "externalId"
	| "lastName"
	| "firstName"
	| "status"
	| "title"
	| "mobile"
	| "phonePrivate"
	| "phonePrivate2"
	| "email"
	| "email2"
	| "street"
	| "postalCode"
	| "city"
	| "country"
	| "birthday"
	| "company"
	| "phoneWork2"
	| "phoneWork"
	| "email3"
	| "forwarding"
	| "houseNumber"
	| "addressLine2"
	| "lettersOptOut"
	| "addressNeedsUpdate"
	| "notes";

export type ColDef =
	| { header: string; field: MemberField; kind?: ColKind }
	| { header: string; extraKey: string };

// The first 23 entries mirror the real spreadsheet exactly (so re-import of the
// original file works and export looks identical). The trailing entries are the
// app-managed fields, appended so an export→re-import round-trips them too; the
// original file simply lacks these headers.
export const COLUMNS: ColDef[] = [
	{ header: "ID", field: "externalId" },
	{ header: "Nachname", field: "lastName" },
	{ header: "Vorname", field: "firstName" },
	{ header: "Abteilung", field: "status" },
	{ header: "Position", field: "title" },
	{ header: "Mobiltelefonnummer", field: "mobile" },
	{ header: "Telefon (privat)", field: "phonePrivate" },
	{ header: "Telefon (privat 2)", field: "phonePrivate2" },
	{ header: "E-Mail-Adresse", field: "email" },
	{ header: "E-Mail 2", field: "email2" },
	{ header: "Adresse privat: Straße", field: "street" },
	{ header: "Adresse privat: PLZ", field: "postalCode" },
	{ header: "Adresse privat: Ort", field: "city" },
	{ header: "Adresse privat: Land/Region", field: "country" },
	{ header: "Geburtstag", field: "birthday", kind: "date" },
	{ header: "Firma", field: "company" },
	{ header: "Telefon geschäftlich 2", field: "phoneWork2" },
	{ header: "Telefon (geschäftlich)", field: "phoneWork" },
	{ header: "E-Mail 3", field: "email3" },
	{ header: "Weiterleitung", field: "forwarding", kind: "bool" },
	{ header: "Geändert", extraKey: "Geändert" },
	{ header: "Elementtyp", extraKey: "Elementtyp" },
	{ header: "Pfad", extraKey: "Pfad" },
	// App-managed fields (not in the original file).
	{ header: "Hausnummer", field: "houseNumber" },
	{ header: "Adresszusatz", field: "addressLine2" },
	{ header: "Nur Email", field: "lettersOptOut", kind: "bool" },
	{ header: "Adresse veraltet", field: "addressNeedsUpdate", kind: "bool" },
	{ header: "Notizen", field: "notes" },
];

// Canonical casing for known statuses (Abteilung). Unknown values pass through
// unchanged so genuinely new categories are preserved. Matching is
// case/punctuation-insensitive: "iaCB"/"IACB" -> "IaCB", "iaCBoB" -> "IaCBoB".
const STATUS_CANON: Record<string, string> = {
	fuchs: "Fuchs",
	fux: "Fuchs",
	cb: "CB",
	iacb: "IaCB",
	iacbob: "IaCBoB",
	ah: "AH",
	aheb: "AHEB",
	ahidc: "AH idC",
	fck: "FCK",
};

export function normalizeStatus(raw: string | null | undefined): string {
	const s = (raw ?? "").trim();
	if (!s) return "";
	const key = s.toLowerCase().replace(/[^a-z]/g, "");
	return STATUS_CANON[key] ?? s;
}

export function parseBool(raw: unknown): boolean {
	const v = String(raw ?? "")
		.trim()
		.toLowerCase();
	return ["1", "ja", "x", "true", "wahr", "y", "yes"].includes(v);
}

export function boolToCell(v: boolean): string {
	return v ? "1" : "0";
}

function fmtDMY(d: Date): string {
	const dd = String(d.getUTCDate()).padStart(2, "0");
	const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
	return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

// Geburtstag arrives as a Date (date-formatted cell), an Excel serial number, or
// plain text. Normalize to a "DD.MM.YYYY" string for storage + round-trip.
export function parseExcelDate(value: unknown, text: string): string | null {
	if (value instanceof Date) return fmtDMY(value);
	if (typeof value === "number" && value > 0 && value < 100000) {
		return fmtDMY(
			new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000),
		);
	}
	const t = (text ?? "").trim();
	return t || null;
}
