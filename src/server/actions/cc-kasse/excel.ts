"use server";

import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { kostenpunkte, kostenpunktPositionen } from "~/server/db/schema";
import { EDIT_ROLES, requireRoles } from "./_guards";
import {
	BODY_START_ROW,
	COL,
	categoryFromSubtotal,
	grandTotalLabel,
	HEADERS,
	isGrandTotalLabel,
	isSubsidyLabel,
	isSubtotalLabel,
	NUMBER_FORMAT,
	parseGermanNumber,
	SHEET_NAME,
	SUBSIDY_LABEL,
	subtotalLabel,
	titleText,
} from "./etaplan-excel-map";

function round2(n: number) {
	return Math.round(n * 100) / 100;
}

type ParsedPosition = {
	bemerkung: string | null;
	ausgaben: number;
	einnahmen: number;
};
type ParsedKp = {
	category: string;
	categoryOrder: number;
	name: string;
	positionen: ParsedPosition[];
};

// ─── Export ──────────────────────────────────────────────────────────────────

export async function exportEtaplanXlsx(etaplanId: string) {
	const guard = await requireRoles(EDIT_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	try {
		const plan = await db.query.etaplans.findFirst({
			where: (t, { eq }) => eq(t.id, etaplanId),
		});
		if (!plan) {
			return { success: false as const, error: "Etatplan nicht gefunden" };
		}

		const kps = await db.query.kostenpunkte.findMany({
			where: (t, { eq }) => eq(t.etaplanId, etaplanId),
			orderBy: (t, { asc }) => [
				asc(t.categoryOrder),
				asc(t.displayOrder),
				asc(t.createdAt),
			],
			with: { positionen: { orderBy: (p, { asc }) => [asc(p.displayOrder)] } },
		});

		const wb = new ExcelJS.Workbook();
		const ws = wb.addWorksheet(SHEET_NAME);
		ws.getColumn(1).width = 30;
		ws.getColumn(2).width = 12;
		ws.getColumn(3).width = 42;
		ws.getColumn(4).width = 14;
		ws.getColumn(5).width = 16;

		// Title row + year cell.
		ws.mergeCells(1, 1, 1, 4);
		const titleCell = ws.getCell(1, 1);
		titleCell.value = titleText(plan.semesterType);
		titleCell.font = { bold: true, size: 16 };
		titleCell.alignment = { horizontal: "center" };
		const yearCell = ws.getCell(1, 5);
		yearCell.value = plan.year;
		yearCell.font = { bold: true, size: 16 };

		// Header row.
		HEADERS.forEach((h, i) => {
			const c = ws.getCell(2, i + 1);
			c.value = h;
			c.font = { bold: true };
		});

		// Group kostenpunkte by category, preserving order.
		const cats: { category: string; items: typeof kps }[] = [];
		for (const kp of kps) {
			let g = cats.find((c) => c.category === kp.category);
			if (!g) {
				g = { category: kp.category, items: [] };
				cats.push(g);
			}
			g.items.push(kp);
		}

		let r = BODY_START_ROW;
		const subtotalRows: number[] = [];

		for (const cat of cats) {
			const first = r;
			for (const kp of cat.items) {
				if (kp.positionen.length === 0) {
					ws.getCell(r, COL.name).value = kp.name;
					const d = ws.getCell(r, COL.ausgaben);
					d.value = kp.budget || 0;
					d.numFmt = NUMBER_FORMAT;
					d.font = { color: { argb: "FFFF0000" } };
					const e = ws.getCell(r, COL.einnahmen);
					e.value = kp.income || 0;
					e.numFmt = NUMBER_FORMAT;
					r++;
				} else {
					kp.positionen.forEach((p, j) => {
						ws.getCell(r, COL.name).value = j === 0 ? kp.name : null;
						ws.getCell(r, COL.bemerkung).value = p.bemerkung ?? null;
						const d = ws.getCell(r, COL.ausgaben);
						d.value = p.ausgaben || 0;
						d.numFmt = NUMBER_FORMAT;
						d.font = { color: { argb: "FFFF0000" } };
						const e = ws.getCell(r, COL.einnahmen);
						e.value = p.einnahmen || 0;
						e.numFmt = NUMBER_FORMAT;
						r++;
					});
				}
			}
			const last = r - 1;

			ws.mergeCells(r, 1, r, 3);
			const labelCell = ws.getCell(r, 1);
			labelCell.value = subtotalLabel(cat.category);
			labelCell.font = { bold: true };
			labelCell.alignment = { horizontal: "center" };
			const sd = ws.getCell(r, COL.ausgaben);
			sd.value = last >= first ? { formula: `SUM(D${first}:D${last})` } : 0;
			sd.numFmt = NUMBER_FORMAT;
			sd.font = { bold: true };
			const se = ws.getCell(r, COL.einnahmen);
			se.value = last >= first ? { formula: `SUM(E${first}:E${last})` } : 0;
			se.numFmt = NUMBER_FORMAT;
			se.font = { bold: true };
			for (let c = 1; c <= 5; c++) {
				ws.getCell(r, c).border = {
					top: { style: "medium" },
					bottom: { style: "medium" },
				};
			}
			subtotalRows.push(r);
			r++;
		}

		// Grand total.
		const grandRow = r;
		ws.mergeCells(r, 1, r, 3);
		const gLabel = ws.getCell(r, 1);
		gLabel.value = grandTotalLabel(plan.semesterType, plan.year);
		gLabel.font = { bold: true };
		gLabel.alignment = { horizontal: "center" };
		const gd = ws.getCell(r, COL.ausgaben);
		gd.value = subtotalRows.length
			? { formula: subtotalRows.map((x) => `D${x}`).join("+") }
			: 0;
		gd.numFmt = NUMBER_FORMAT;
		gd.font = { bold: true };
		const ge = ws.getCell(r, COL.einnahmen);
		ge.value = subtotalRows.length
			? { formula: subtotalRows.map((x) => `E${x}`).join("+") }
			: 0;
		ge.numFmt = NUMBER_FORMAT;
		ge.font = { bold: true };
		r++;

		// Zuschuss AHV.
		ws.mergeCells(r, 1, r, 3);
		const subLabel = ws.getCell(r, 1);
		subLabel.value = SUBSIDY_LABEL;
		subLabel.font = { bold: true };
		subLabel.alignment = { horizontal: "center" };
		const subD = ws.getCell(r, COL.ausgaben);
		subD.value = { formula: `D${grandRow}-E${grandRow}` };
		subD.numFmt = NUMBER_FORMAT;
		subD.font = { bold: true };

		const buffer = await wb.xlsx.writeBuffer();
		const base64 = Buffer.from(buffer).toString("base64");
		const fileName = `Etatplan_${plan.semesterType}${plan.year}.xlsx`;
		return { success: true as const, base64, fileName };
	} catch (error) {
		console.error("Error exporting etaplan:", error);
		return { success: false as const, error: "Export fehlgeschlagen" };
	}
}

// ─── Import (line-for-line into positions, merge/upsert) ──────────────────────

export async function importEtaplanXlsx(input: {
	etaplanId: string;
	base64: string;
}) {
	const guard = await requireRoles(EDIT_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };

	try {
		const { etaplanId, base64 } = input;
		const plan = await db.query.etaplans.findFirst({
			where: (t, { eq }) => eq(t.id, etaplanId),
			columns: { id: true },
		});
		if (!plan) {
			return { success: false as const, error: "Etatplan nicht gefunden" };
		}

		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(
			Buffer.from(base64, "base64") as unknown as Parameters<
				typeof wb.xlsx.load
			>[0],
		);
		const ws = wb.getWorksheet(SHEET_NAME) ?? wb.worksheets[0];
		if (!ws) {
			return { success: false as const, error: "Tabellenblatt nicht gefunden" };
		}

		const errors: string[] = [];
		const parsed: ParsedKp[] = [];
		let blockKps: { name: string; positionen: ParsedPosition[] }[] = [];
		let currentKp: { name: string; positionen: ParsedPosition[] } | null = null;
		let catIndex = 0;

		const text = (row: number, col: number) =>
			String(ws.getCell(row, col).text ?? "").trim();
		const flushKp = () => {
			if (currentKp) {
				blockKps.push(currentKp);
				currentKp = null;
			}
		};

		const lastRow = ws.rowCount;
		for (let row = BODY_START_ROW; row <= lastRow; row++) {
			const nameCell = text(row, COL.name);
			const bemerkung = text(row, COL.bemerkung);
			const ausgaben = parseGermanNumber(ws.getCell(row, COL.ausgaben).text);
			const einnahmen = parseGermanNumber(ws.getCell(row, COL.einnahmen).text);

			if (nameCell) {
				if (isGrandTotalLabel(nameCell) || isSubsidyLabel(nameCell)) {
					break; // tail reached
				}
				if (isSubtotalLabel(nameCell)) {
					flushKp();
					const category = categoryFromSubtotal(nameCell);
					for (const kp of blockKps) {
						parsed.push({
							category,
							categoryOrder: catIndex,
							name: kp.name,
							positionen: kp.positionen,
						});
					}
					blockKps = [];
					catIndex++;
					continue;
				}
			}

			if (!nameCell && !bemerkung && ausgaben === 0 && einnahmen === 0) {
				continue; // empty row
			}

			const pos: ParsedPosition = {
				bemerkung: bemerkung || null,
				ausgaben,
				einnahmen,
			};
			if (nameCell) {
				flushKp();
				currentKp = { name: nameCell, positionen: [pos] };
			} else {
				if (!currentKp) {
					currentKp = { name: bemerkung || "Unbenannt", positionen: [] };
				}
				currentKp.positionen.push(pos);
			}
		}

		// Any trailing lines without a closing "Summe" row.
		flushKp();
		if (blockKps.length) {
			for (const kp of blockKps) {
				parsed.push({
					category: "Sonstiges",
					categoryOrder: catIndex,
					name: kp.name,
					positionen: kp.positionen,
				});
			}
		}

		if (parsed.length === 0) {
			return {
				success: false as const,
				error: "Keine Kostenpunkte in der Datei gefunden",
			};
		}

		const existing = await db
			.select({
				id: kostenpunkte.id,
				category: kostenpunkte.category,
				name: kostenpunkte.name,
			})
			.from(kostenpunkte)
			.where(eq(kostenpunkte.etaplanId, etaplanId));
		const key = (c: string, n: string) => `${c} ${n}`;
		const existingMap = new Map(
			existing.map((e) => [key(e.category, e.name), e.id]),
		);
		const matchedIds = new Set<string>();

		let created = 0;
		let updated = 0;

		for (const kp of parsed) {
			const budget = round2(kp.positionen.reduce((s, p) => s + p.ausgaben, 0));
			const income = round2(kp.positionen.reduce((s, p) => s + p.einnahmen, 0));
			const posRows = (id: string) =>
				kp.positionen.map((p, i) => ({
					kostenpunktId: id,
					bemerkung: p.bemerkung,
					ausgaben: round2(p.ausgaben),
					einnahmen: round2(p.einnahmen),
					displayOrder: i,
				}));

			const existingId = existingMap.get(key(kp.category, kp.name));
			if (existingId) {
				matchedIds.add(existingId);
				await db
					.update(kostenpunkte)
					.set({ categoryOrder: kp.categoryOrder, budget, income })
					.where(eq(kostenpunkte.id, existingId));
				await db
					.delete(kostenpunktPositionen)
					.where(eq(kostenpunktPositionen.kostenpunktId, existingId));
				if (kp.positionen.length) {
					await db.insert(kostenpunktPositionen).values(posRows(existingId));
				}
				updated++;
			} else {
				const id = crypto.randomUUID();
				await db.insert(kostenpunkte).values({
					id,
					etaplanId,
					category: kp.category,
					categoryOrder: kp.categoryOrder,
					name: kp.name,
					budget,
					income,
				});
				if (kp.positionen.length) {
					await db.insert(kostenpunktPositionen).values(posRows(id));
				}
				created++;
			}
		}

		const unchanged = existing.length - matchedIds.size;
		const note =
			unchanged > 0
				? `${unchanged} bestehende Kostenpunkte waren nicht in der Datei und wurden beibehalten.`
				: undefined;

		revalidatePath("/cc-kasse");
		return {
			success: true as const,
			created,
			updated,
			unchanged,
			errors,
			note,
		};
	} catch (error) {
		console.error("Error importing etaplan:", error);
		return { success: false as const, error: "Import fehlgeschlagen" };
	}
}
