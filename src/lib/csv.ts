// csv.ts — one way to write CSV cells for every export.
//
// - Quoting (RFC 4180): a cell with the delimiter, a quote or a line break
//   is wrapped in quotes and inner quotes are doubled.
// - Formula injection: Excel and LibreOffice run a cell that starts with
//   `=`, `+`, `-`, `@`, tab or CR as a formula, so a display name like
//   `=HYPERLINK(...)` would execute for whoever opens the export. Such cells
//   get a leading `'`. Plain numbers (`-5`, `-12,50`, `-3,00 EUR`) are left
//   alone so amounts stay numbers.

const FORMULA_START = /^[=+\-@\t\r]/;
// Optional sign, digits with `.`/`,` separators, optional unit.
const PLAIN_NUMBER = /^[+-]?\d+(?:[.,]\d+)*(?: ?(?:EUR|€|%))?$/;

/** Whether a spreadsheet would read this text as the start of a formula. */
export function startsLikeFormula(value: string): boolean {
	return FORMULA_START.test(value);
}

/** Neutralises a cell Excel would treat as a formula. */
export function csvSafe(value: string): string {
	if (!startsLikeFormula(value) || PLAIN_NUMBER.test(value)) {
		return value;
	}
	return `'${value}`;
}

/**
 * One CSV cell: formula-guarded, then quoted if needed (or always, for
 * exports that quote every field).
 */
export function csvCell(
	value: string | number | null | undefined,
	delimiter = ",",
	opts: { alwaysQuote?: boolean } = {},
): string {
	const safe = csvSafe(value == null ? "" : String(value));
	const needsQuotes =
		opts.alwaysQuote ||
		safe.includes(delimiter) ||
		safe.includes('"') ||
		safe.includes("\n") ||
		safe.includes("\r");
	return needsQuotes ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** A CSV line from raw values. */
export function csvRow(
	values: Array<string | number | null | undefined>,
	delimiter = ",",
	opts: { alwaysQuote?: boolean } = {},
): string {
	return values.map((v) => csvCell(v, delimiter, opts)).join(delimiter);
}
