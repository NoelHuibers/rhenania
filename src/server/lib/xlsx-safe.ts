// xlsx-safe.ts — formula guard for the XLSX exports (#91).
//
// ExcelJS writes strings as typed text cells, which Excel and LibreOffice
// never evaluate on open. A cell in the "General" format is re-parsed once
// someone edits it (F2, Enter), though, so `=HYPERLINK(...)` in a display
// name would turn into a live formula. Text cells that start like a formula
// get the Text number format (`@`), which keeps them text when edited. The
// value itself is unchanged, unlike the `'` prefix of the CSV exports, so
// phone numbers such as "+49 …" survive an export → import round trip.

import ExcelJS from "exceljs";
import { startsLikeFormula } from "~/lib/csv";

/** The number format Excel shows as "Text". */
export const TEXT_FORMAT = "@";

/** Gives every formula-like text cell of the sheet the Text format. */
export function protectFormulaLikeText(ws: ExcelJS.Worksheet): void {
	ws.eachRow((row) => {
		row.eachCell((cell) => {
			if (
				cell.type === ExcelJS.ValueType.String &&
				startsLikeFormula(String(cell.value))
			) {
				cell.numFmt = TEXT_FORMAT;
			}
		});
	});
}
