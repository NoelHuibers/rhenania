// Central column map for the member Adressliste Excel. The import + export read
// ONLY from here, so adapting to the real member spreadsheet is a one-file edit.

import type { MemberStatus } from "./_guards";

export const SHEET_NAME = "Adressliste";
export const HEADER_ROW = 1;
export const BODY_START_ROW = 2;

// TODO(member-excel): replace COL/HEADERS/STATUS_MAP with the real member
// spreadsheet's layout once the user provides it. 1-based column indices.
export const COL = {
	lastName: 1,
	firstName: 2,
	status: 3,
	email: 4,
	street: 5,
	houseNumber: 6,
	postalCode: 7,
	city: 8,
	country: 9,
	lettersOptOut: 10,
	addressNeedsUpdate: 11,
} as const;

export type ColKey = keyof typeof COL;

export const HEADERS: Record<ColKey, string> = {
	lastName: "Nachname",
	firstName: "Vorname",
	status: "Status",
	email: "Email",
	street: "Straße",
	houseNumber: "Hausnr.",
	postalCode: "PLZ",
	city: "Ort",
	country: "Land",
	lettersOptOut: "Nur Email",
	addressNeedsUpdate: "Adresse veraltet",
};

const STATUS_MAP: Record<string, MemberStatus> = {
	fuchs: "Fuchs",
	fux: "Fuchs",
	f: "Fuchs",
	cb: "CB",
	corpsbursche: "CB",
	bursche: "CB",
	aktiver: "CB",
	aktiv: "CB",
	iacb: "IaCB",
	"ia cb": "IaCB",
	inaktiv: "IaCB",
	inaktiver: "IaCB",
	ah: "AH",
	"alter herr": "AH",
	aheb: "AHEB",
	"ah eb": "AHEB",
};

export function parseStatus(raw: unknown): MemberStatus | null {
	const key = String(raw ?? "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");
	if (!key) return null;
	return STATUS_MAP[key] ?? null;
}

export function parseBool(raw: unknown): boolean {
	const v = String(raw ?? "")
		.trim()
		.toLowerCase();
	return ["ja", "x", "true", "1", "wahr", "y", "yes"].includes(v);
}

export function boolToCell(v: boolean): string {
	return v ? "ja" : "";
}
