// Single source of truth for the EtatplanWS layout, matched to the real
// EP_SS26.xlsx. Both the export and import in `excel.ts` read only from here,
// so adapting to a different workbook is a one-file edit.

export const SHEET_NAME = "EtatplanWS";
export const TITLE_ROW = 1;
export const HEADER_ROW = 2;
export const BODY_START_ROW = 3;
export const YEAR_CELL = "E1";

// 1-based column indices (A=1).
export const COL = {
	name: 1, // A — Kostenpunkt (event name, on the block's first line)
	datum: 2, // B — Datum (always empty)
	bemerkung: 3, // C — Bemerkung (line description)
	ausgaben: 4, // D — Ausgaben (expense)
	einnahmen: 5, // E — Einnahmen (income)
} as const;

export const HEADERS = [
	"Kostenpunkt:",
	"Datum:",
	"Bemerkung:",
	"Ausgaben:",
	"Einnahmen:",
];

export const SUBTOTAL_PREFIX = "Summe ";
export const SUBSIDY_LABEL = "Zuschuss AHV";
export const TITLE_PREFIX = "Corps Rhenania Stuttgart Etatplan ";

// German accounting € mask (matches the source file).
export const NUMBER_FORMAT =
	'_-* #,##0.00\\ "€"_-;\\-* #,##0.00\\ "€"_-;_-* "-"??\\ "€"_-;_-@_-';

const GRAND_TOTAL_RE = /^Summe\s+(SS|WS)\s?\d{2,4}$/i;

export function trimLabel(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

export function isGrandTotalLabel(label: string): boolean {
	return GRAND_TOTAL_RE.test(trimLabel(label));
}

export function isSubsidyLabel(label: string): boolean {
	return trimLabel(label).toLowerCase() === SUBSIDY_LABEL.toLowerCase();
}

export function isSubtotalLabel(label: string): boolean {
	const t = trimLabel(label);
	return (
		t.startsWith(SUBTOTAL_PREFIX) && !isGrandTotalLabel(t) && !isSubsidyLabel(t)
	);
}

export function categoryFromSubtotal(label: string): string {
	return trimLabel(label).slice(SUBTOTAL_PREFIX.length).trim();
}

/** Parse a German-formatted number (e.g. "1.855,00 €" → 1855). */
export function parseGermanNumber(value: unknown): number {
	if (value == null || value === "") return 0;
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const s = String(value).replace(/[^\d,.-]/g, "");
	if (!s || s === "-") return 0;
	const normalized = s.replace(/\./g, "").replace(",", ".");
	const n = Number.parseFloat(normalized);
	return Number.isFinite(n) ? n : 0;
}

export function subtotalLabel(gruppe: string): string {
	return `${SUBTOTAL_PREFIX}${gruppe}`;
}

export function grandTotalLabel(
	semesterType: "SS" | "WS",
	year: number,
): string {
	return `${SUBTOTAL_PREFIX}${semesterType}${year}`;
}

export function titleText(semesterType: "SS" | "WS"): string {
	return `${TITLE_PREFIX}${semesterType}`;
}
