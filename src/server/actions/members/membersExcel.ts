"use server";

import { eq, isNull, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { members, users } from "~/server/db/schema";
import { MEMBER_EDIT_ROLES, requireRoles } from "./_guards";
import {
	BODY_START_ROW,
	boolToCell,
	COLUMNS,
	HEADER_ROW,
	parseBool,
	parseExcelDate,
	SHEET_NAME,
} from "./members-excel-map";

export async function exportMembersXlsx() {
	const guard = await requireRoles(MEMBER_EDIT_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	try {
		const rows = await db
			.select()
			.from(members)
			.orderBy(members.lastName, members.firstName);

		const wb = new ExcelJS.Workbook();
		const ws = wb.addWorksheet(SHEET_NAME);

		COLUMNS.forEach((def, i) => {
			ws.getCell(HEADER_ROW, i + 1).value = def.header;
			ws.getColumn(i + 1).width = 18;
		});
		ws.getRow(HEADER_ROW).font = { bold: true };

		let r = BODY_START_ROW;
		for (const m of rows) {
			const rec = m as Record<string, unknown>;
			COLUMNS.forEach((def, i) => {
				let val: string | number = "";
				if ("extraKey" in def) {
					val = m.extra?.[def.extraKey] ?? "";
				} else if (def.kind === "bool") {
					val = boolToCell(Boolean(rec[def.field]));
				} else {
					const x = rec[def.field];
					val = x == null ? "" : String(x);
				}
				ws.getCell(r, i + 1).value = val;
			});
			r++;
		}

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

export async function importMembersXlsx(input: { base64: string }) {
	const guard = await requireRoles(MEMBER_EDIT_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

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

		// Map header text -> column index.
		const headerToCol = new Map<string, number>();
		const colCount = ws.columnCount;
		for (let c = 1; c <= colCount; c++) {
			const h = String(ws.getCell(HEADER_ROW, c).text ?? "").trim();
			if (h) headerToCol.set(h, c);
		}
		const mapped = COLUMNS.map((def) => ({
			def,
			col: headerToCol.get(def.header),
		})).filter((x): x is { def: (typeof COLUMNS)[number]; col: number } =>
			Boolean(x.col),
		);
		const knownCols = new Set(mapped.map((m) => m.col));
		const extraCols: { header: string; col: number }[] = [];
		for (const [h, c] of headerToCol) {
			if (!knownCols.has(c)) extraCols.push({ header: h, col: c });
		}

		// Existing members for upsert matching.
		const existing = await db.select().from(members);
		const byExt = new Map<string, string>();
		const byEmail = new Map<string, string>();
		const byName = new Map<string, string>();
		for (const m of existing) {
			if (m.externalId) byExt.set(m.externalId, m.id);
			if (m.email) byEmail.set(m.email.toLowerCase(), m.id);
			byName.set(
				`${m.lastName.toLowerCase()}|${m.firstName.toLowerCase()}`,
				m.id,
			);
		}

		const errors: string[] = [];
		let created = 0;
		let updated = 0;
		let skipped = 0;
		const lastRow = ws.rowCount;

		for (let row = BODY_START_ROW; row <= lastRow; row++) {
			const v: Record<string, string | boolean | null> = {};
			const extra: Record<string, string> = {};
			for (const { def, col } of mapped) {
				const cell = ws.getCell(row, col);
				const text = String(cell.text ?? "").trim();
				if ("extraKey" in def) {
					if (text) extra[def.extraKey] = text;
				} else if (def.kind === "bool") {
					v[def.field] = parseBool(text);
				} else if (def.kind === "date") {
					v[def.field] = parseExcelDate(cell.value, text);
				} else {
					v[def.field] = text || null;
				}
			}
			for (const { header, col } of extraCols) {
				const text = String(ws.getCell(row, col).text ?? "").trim();
				if (text) extra[header] = text;
			}

			const lastName = (v.lastName as string | null) ?? null;
			const firstName = (v.firstName as string | null) ?? null;
			if (!lastName && !firstName) continue; // empty row
			if (!lastName || !firstName) {
				errors.push(`Zeile ${row}: Name unvollständig`);
				skipped++;
				continue;
			}
			const externalId = (v.externalId as string | null) ?? null;
			const email = (v.email as string | null) ?? null;

			const record = {
				status: (v.status as string | null) || "AH",
				firstName,
				lastName,
				email,
				email2: (v.email2 as string | null) ?? null,
				email3: (v.email3 as string | null) ?? null,
				title: (v.title as string | null) ?? null,
				mobile: (v.mobile as string | null) ?? null,
				phonePrivate: (v.phonePrivate as string | null) ?? null,
				phonePrivate2: (v.phonePrivate2 as string | null) ?? null,
				phoneWork: (v.phoneWork as string | null) ?? null,
				phoneWork2: (v.phoneWork2 as string | null) ?? null,
				company: (v.company as string | null) ?? null,
				birthday: (v.birthday as string | null) ?? null,
				street: (v.street as string | null) ?? null,
				houseNumber: (v.houseNumber as string | null) ?? null,
				addressLine2: (v.addressLine2 as string | null) ?? null,
				postalCode: (v.postalCode as string | null) ?? null,
				city: (v.city as string | null) ?? null,
				country: (v.country as string | null) || "Deutschland",
				forwarding: (v.forwarding as boolean | undefined) ?? false,
				lettersOptOut: (v.lettersOptOut as boolean | undefined) ?? false,
				addressNeedsUpdate:
					(v.addressNeedsUpdate as boolean | undefined) ?? false,
				notes: (v.notes as string | null) ?? null,
				externalId,
				extra: Object.keys(extra).length ? extra : null,
			};

			const matchId =
				(externalId ? byExt.get(externalId) : undefined) ??
				(email ? byEmail.get(email.toLowerCase()) : undefined) ??
				byName.get(`${lastName.toLowerCase()}|${firstName.toLowerCase()}`);

			if (matchId) {
				await db
					.update(members)
					.set({ ...record, updatedBy: guard.userId })
					.where(eq(members.id, matchId));
				updated++;
			} else {
				const [ins] = await db
					.insert(members)
					.values({
						...record,
						createdBy: guard.userId,
						updatedBy: guard.userId,
					})
					.returning({ id: members.id });
				if (ins) {
					if (externalId) byExt.set(externalId, ins.id);
					if (email) byEmail.set(email.toLowerCase(), ins.id);
					byName.set(
						`${lastName.toLowerCase()}|${firstName.toLowerCase()}`,
						ins.id,
					);
				}
				created++;
			}
		}

		// Auto-link accounts by email.
		let linked = 0;
		const unlinked = await db
			.select({ id: members.id, email: members.email })
			.from(members)
			.where(isNull(members.userId));
		for (const m of unlinked) {
			if (!m.email) continue;
			const [u] = await db
				.select({ id: users.id })
				.from(users)
				.where(sql`lower(${users.email}) = lower(${m.email})`)
				.limit(1);
			if (u) {
				await db
					.update(members)
					.set({ userId: u.id })
					.where(eq(members.id, m.id));
				linked++;
			}
		}

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
