"use server";

import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { members } from "~/server/db/schema";
import { protectFormulaLikeText } from "~/server/lib/xlsx-safe";
import { MEMBER_EDIT_ROLES, requireRoles } from "./_guards";
import { applyLink, computeLinkablePairs } from "./link-helpers";
import {
	BODY_START_ROW,
	boolToCell,
	COLUMNS,
	type ColDef,
	HEADER_ROW,
	type MemberField,
	normalizeStatus,
	parseBool,
	parseExcelDate,
	SHEET_NAME,
} from "./members-excel-map";

type Member = typeof members.$inferSelect;
type MemberInsert = typeof members.$inferInsert;
type MemberExtra = Record<string, string>;

// Headers (and SharePoint extra keys) that COLUMNS already owns. A custom
// `extra` key with the same name could not be told apart on re-import.
const RESERVED_HEADERS = new Set(
	COLUMNS.flatMap((def) =>
		"extraKey" in def ? [def.header, def.extraKey] : [def.header],
	),
);

/** Custom `extra` keys of all members (beyond COLUMNS), sorted for a stable sheet. */
function customExtraKeys(rows: Member[]): string[] {
	const keys = new Set<string>();
	for (const m of rows) {
		for (const key of Object.keys(m.extra ?? {})) {
			if (!RESERVED_HEADERS.has(key)) {
				keys.add(key);
			}
		}
	}
	return [...keys].sort((a, b) => a.localeCompare(b, "de"));
}

function exportCell(m: Member, def: ColDef): string {
	if ("extraKey" in def) {
		return m.extra?.[def.extraKey] ?? "";
	}
	const value = m[def.field];
	if (def.kind === "bool") {
		return boolToCell(Boolean(value));
	}
	return value == null ? "" : String(value);
}

export async function exportMembersXlsx() {
	const guard = await requireRoles(MEMBER_EDIT_ROLES);
	if (!guard.ok) {
		return { success: false as const, error: guard.error };
	}

	try {
		const rows = await db
			.select()
			.from(members)
			.orderBy(members.lastName, members.firstName);

		// Custom columns kept in `extra` by an earlier import are written after
		// the fixed ones so an export → import round trip keeps them.
		const columns: ColDef[] = [
			...COLUMNS,
			...customExtraKeys(rows).map((key) => ({ header: key, extraKey: key })),
		];

		const wb = new ExcelJS.Workbook();
		const ws = wb.addWorksheet(SHEET_NAME);

		for (const [i, def] of columns.entries()) {
			ws.getCell(HEADER_ROW, i + 1).value = def.header;
			ws.getColumn(i + 1).width = 18;
		}
		ws.getRow(HEADER_ROW).font = { bold: true };

		let r = BODY_START_ROW;
		for (const m of rows) {
			for (const [i, def] of columns.entries()) {
				ws.getCell(r, i + 1).value = exportCell(m, def);
			}
			r++;
		}

		protectFormulaLikeText(ws);
		const buffer = await wb.xlsx.writeBuffer();
		return {
			success: true as const,
			base64: Buffer.from(buffer).toString("base64"),
			fileName: "Adressliste.xlsx",
		};
	} catch (error) {
		console.error("Error exporting members:", error);
		return { success: false as const, error: "Export fehlgeschlagen" };
	}
}

type FieldCol = { def: Extract<ColDef, { field: MemberField }>; col: number };
type ExtraCol = { key: string; col: number };

/** Which member fields and `extra` keys the sheet carries, and where. */
function mapSheetColumns(ws: ExcelJS.Worksheet) {
	const headerToCol = new Map<string, number>();
	for (let c = 1; c <= ws.columnCount; c++) {
		const h = String(ws.getCell(HEADER_ROW, c).text ?? "").trim();
		if (h) {
			headerToCol.set(h, c);
		}
	}
	const fieldCols: FieldCol[] = [];
	const extraCols: ExtraCol[] = [];
	const knownCols = new Set<number>();
	for (const def of COLUMNS) {
		const col = headerToCol.get(def.header);
		if (!col) {
			continue;
		}
		knownCols.add(col);
		if ("extraKey" in def) {
			extraCols.push({ key: def.extraKey, col });
		} else {
			fieldCols.push({ def, col });
		}
	}
	// Unknown columns are kept losslessly in `extra`, keyed by their header.
	for (const [header, col] of headerToCol) {
		if (!knownCols.has(col)) {
			extraCols.push({ key: header, col });
		}
	}
	return { fieldCols, extraCols };
}

/** The sheet's `extra` values replace the stored ones for the sheet's keys only. */
function mergeExtra(
	stored: MemberExtra | null | undefined,
	sheetKeys: ReadonlySet<string>,
	values: MemberExtra,
): MemberExtra | null {
	const kept = Object.entries(stored ?? {}).filter(
		([key]) => !sheetKeys.has(key),
	);
	const merged = { ...Object.fromEntries(kept), ...values };
	return Object.keys(merged).length ? merged : null;
}

type RowValues = Partial<Record<MemberField, string | boolean | null>>;

function readRow(
	ws: ExcelJS.Worksheet,
	row: number,
	fieldCols: FieldCol[],
	extraCols: ExtraCol[],
): { v: RowValues; extra: MemberExtra } {
	const v: RowValues = {};
	for (const { def, col } of fieldCols) {
		const cell = ws.getCell(row, col);
		const text = String(cell.text ?? "").trim();
		if (def.kind === "bool") {
			v[def.field] = parseBool(text);
		} else if (def.kind === "date") {
			v[def.field] = parseExcelDate(cell.value, text);
		} else {
			v[def.field] = text || null;
		}
	}
	const extra: MemberExtra = {};
	for (const { key, col } of extraCols) {
		const text = String(ws.getCell(row, col).text ?? "").trim();
		if (text) {
			extra[key] = text;
		}
	}
	return { v, extra };
}

/** Every mapped field of a row, with the defaults a new member gets. */
function toRecord(v: RowValues, firstName: string, lastName: string) {
	const str = (field: MemberField) => (v[field] as string | null) ?? null;
	const bool = (field: MemberField) =>
		(v[field] as boolean | undefined) ?? false;
	return {
		status: normalizeStatus(str("status")) || "AH",
		firstName,
		lastName,
		email: str("email"),
		email2: str("email2"),
		email3: str("email3"),
		title: str("title"),
		mobile: str("mobile"),
		phonePrivate: str("phonePrivate"),
		phonePrivate2: str("phonePrivate2"),
		phoneWork: str("phoneWork"),
		phoneWork2: str("phoneWork2"),
		company: str("company"),
		birthday: str("birthday"),
		street: str("street"),
		houseNumber: str("houseNumber"),
		addressLine2: str("addressLine2"),
		postalCode: str("postalCode"),
		city: str("city"),
		country: str("country") || "Deutschland",
		forwarding: bool("forwarding"),
		lettersOptOut: bool("lettersOptOut"),
		addressNeedsUpdate: bool("addressNeedsUpdate"),
		notes: str("notes"),
		externalId: str("externalId"),
	} satisfies Record<MemberField, unknown>;
}

export async function importMembersXlsx(input: { base64: string }) {
	const guard = await requireRoles(MEMBER_EDIT_ROLES);
	if (!guard.ok) {
		return { success: false as const, error: guard.error };
	}

	try {
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(
			Buffer.from(input.base64, "base64") as unknown as Parameters<
				typeof wb.xlsx.load
			>[0],
		);
		const ws = wb.getWorksheet(SHEET_NAME) ?? wb.worksheets[0];
		if (!ws) {
			return { success: false as const, error: "Tabellenblatt nicht gefunden" };
		}

		const { fieldCols, extraCols } = mapSheetColumns(ws);
		// Only what the sheet carries is written to a matched member; columns
		// missing from the file (e.g. the app-managed ones in the original
		// Corpsverzeichnis) keep their stored values.
		const sheetFields = fieldCols.map(({ def }) => def.field);
		const sheetExtraKeys = new Set(extraCols.map(({ key }) => key));

		// Existing members for upsert matching.
		const existing = await db.select().from(members);
		const byExt = new Map<string, string>();
		const byEmail = new Map<string, string>();
		const byName = new Map<string, string>();
		const storedExtra = new Map<string, MemberExtra | null>();
		for (const m of existing) {
			if (m.externalId) {
				byExt.set(m.externalId, m.id);
			}
			if (m.email) {
				byEmail.set(m.email.toLowerCase(), m.id);
			}
			byName.set(
				`${m.lastName.toLowerCase()}|${m.firstName.toLowerCase()}`,
				m.id,
			);
			storedExtra.set(m.id, m.extra ?? null);
		}

		const errors: string[] = [];
		let created = 0;
		let updated = 0;
		let skipped = 0;
		const lastRow = ws.rowCount;

		for (let row = BODY_START_ROW; row <= lastRow; row++) {
			const { v, extra } = readRow(ws, row, fieldCols, extraCols);
			const lastName = (v.lastName as string | null) ?? null;
			const firstName = (v.firstName as string | null) ?? null;
			if (!lastName && !firstName) {
				continue; // empty row
			}
			if (!lastName || !firstName) {
				errors.push(`Zeile ${row}: Name unvollständig`);
				skipped++;
				continue;
			}
			const record = toRecord(v, firstName, lastName);
			const { externalId, email } = record;

			const matchId =
				(externalId ? byExt.get(externalId) : undefined) ??
				(email ? byEmail.get(email.toLowerCase()) : undefined) ??
				byName.get(`${lastName.toLowerCase()}|${firstName.toLowerCase()}`);

			if (matchId) {
				const patch = Object.fromEntries(
					sheetFields.map((field) => [field, record[field]]),
				) as Partial<MemberInsert>;
				if (sheetExtraKeys.size) {
					patch.extra = mergeExtra(
						storedExtra.get(matchId),
						sheetExtraKeys,
						extra,
					);
					storedExtra.set(matchId, patch.extra);
				}
				await db
					.update(members)
					.set({ ...patch, updatedBy: guard.userId })
					.where(eq(members.id, matchId));
				updated++;
			} else {
				const extraValue = Object.keys(extra).length ? extra : null;
				const [ins] = await db
					.insert(members)
					.values({
						...record,
						extra: extraValue,
						createdBy: guard.userId,
						updatedBy: guard.userId,
					})
					.returning({ id: members.id });
				if (ins) {
					if (externalId) {
						byExt.set(externalId, ins.id);
					}
					if (email) {
						byEmail.set(email.toLowerCase(), ins.id);
					}
					byName.set(
						`${lastName.toLowerCase()}|${firstName.toLowerCase()}`,
						ins.id,
					);
					storedExtra.set(ins.id, extraValue);
				}
				created++;
			}
		}

		// Auto-link accounts by email (shared unambiguous-match logic).
		const { pairs } = await computeLinkablePairs();
		for (const p of pairs) {
			await applyLink(p.memberId, p.userId);
		}
		const linked = pairs.length;

		revalidatePath("/adressliste");
		return {
			success: true as const,
			created,
			updated,
			skipped,
			linked,
			errors,
		};
	} catch (error) {
		console.error("Error importing members:", error);
		return { success: false as const, error: "Import fehlgeschlagen" };
	}
}
