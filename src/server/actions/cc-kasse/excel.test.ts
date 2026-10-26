import { asc, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { describe, expect, test } from "vitest";

import { kostenpunkte, kostenpunktPositionen } from "~/server/db/schema";
import {
	createEtaplan,
	createKostenpunkt,
} from "../../../../test/factories/cc-kasse";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	categoryFromSubtotal,
	grandTotalLabel,
	isGrandTotalLabel,
	isSubsidyLabel,
	isSubtotalLabel,
	parseGermanNumber,
	SHEET_NAME,
	subtotalLabel,
	titleText,
} from "./etaplan-excel-map";
import { exportEtaplanXlsx, importEtaplanXlsx } from "./excel";

setupTestDatabases();

async function setup() {
	await createTenant();
	signInAs(await createUser({ roles: ["Senior"] }));
}

async function loadWorkbook(base64: string) {
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(
		Buffer.from(base64, "base64") as unknown as Parameters<
			typeof wb.xlsx.load
		>[0],
	);
	return wb;
}

async function toBase64(wb: ExcelJS.Workbook) {
	return Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");
}

/** A sheet in the EtatplanWS layout from plain rows (A..E from row 3). */
async function sheet(rows: (string | number | null)[][]) {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet(SHEET_NAME);
	ws.getCell(1, 1).value = titleText("SS");
	ws.getRow(2).values = ["Kostenpunkt:", "Datum:", "Bemerkung:"];
	rows.forEach((r, i) => {
		r.forEach((v, c) => {
			if (v !== null) {
				ws.getCell(i + 3, c + 1).value = v;
			}
		});
	});
	return toBase64(wb);
}

/** Kostenpunkte of a plan with their positions, in display order. */
async function snapshot(etaplanId: string) {
	const db = tenantDb();
	const kps = await db
		.select()
		.from(kostenpunkte)
		.where(eq(kostenpunkte.etaplanId, etaplanId))
		.orderBy(asc(kostenpunkte.categoryOrder), asc(kostenpunkte.name));
	return Promise.all(
		kps.map(async (k) => ({
			category: k.category,
			categoryOrder: k.categoryOrder,
			name: k.name,
			budget: k.budget,
			income: k.income,
			positionen: (
				await db
					.select()
					.from(kostenpunktPositionen)
					.where(eq(kostenpunktPositionen.kostenpunktId, k.id))
					.orderBy(asc(kostenpunktPositionen.displayOrder))
			).map((p) => [p.bemerkung, p.ausgaben, p.einnahmen]),
		})),
	);
}

describe("etaplan-excel-map", () => {
	test.each([
		["1.855,00 €", 1855],
		["-12,50 €", -12.5],
		["0,99", 0.99],
		["  -  € ", 0],
		["", 0],
		[null, 0],
		[undefined, 0],
		[42.5, 42.5],
		[Number.NaN, 0],
		["abc", 0],
	])("parseGermanNumber(%o) = %s", (input, expected) => {
		expect(parseGermanNumber(input)).toBe(expected);
	});

	test("classifies the tail and subtotal labels", () => {
		expect(grandTotalLabel("WS", 2026)).toBe("Summe WS2026");
		expect(isGrandTotalLabel("Summe WS2026")).toBe(true);
		expect(isGrandTotalLabel("  Summe   SS 26 ")).toBe(true);
		expect(isGrandTotalLabel("Summe Kneipen")).toBe(false);
		expect(isSubsidyLabel(" zuschuss  AHV ")).toBe(true);

		expect(subtotalLabel("Kneipen")).toBe("Summe Kneipen");
		expect(isSubtotalLabel("Summe  Kneipen ")).toBe(true);
		expect(isSubtotalLabel("Summe WS2026")).toBe(false);
		expect(isSubtotalLabel("Zuschuss AHV")).toBe(false);
		expect(isSubtotalLabel("Kneipen")).toBe(false);
		expect(categoryFromSubtotal("Summe   Haus  und Hof ")).toBe("Haus und Hof");
	});
});

describe("exportEtaplanXlsx", () => {
	test("writes the EtatplanWS layout with subtotal, total and subsidy formulas", async () => {
		await setup();
		const plan = await createEtaplan({ semesterType: "SS", year: 2026 });
		await createKostenpunkt(plan.id, {
			name: "Antrittskneipe",
			category: "Kneipen",
			categoryOrder: 0,
			positionen: [
				{ bemerkung: "Bier", ausgaben: 300, einnahmen: 50 },
				{ bemerkung: "Essen", ausgaben: 120 },
			],
		});
		await createKostenpunkt(plan.id, {
			name: "Putzen",
			category: "Haus",
			categoryOrder: 1,
			budget: 80,
			income: 0,
		});

		const result = await exportEtaplanXlsx(plan.id);

		expect(result).toMatchObject({
			success: true,
			fileName: "Etatplan_SS2026.xlsx",
		});
		if (!result.success) {
			return;
		}
		const ws = (await loadWorkbook(result.base64)).getWorksheet(SHEET_NAME);
		if (!ws) {
			throw new Error("sheet missing");
		}
		const cell = (addr: string) => ws.getCell(addr).value;
		expect(cell("A1")).toBe("Corps Rhenania Stuttgart Etatplan SS");
		expect(cell("E1")).toBe(2026);
		expect(ws.getRow(2).values).toEqual([
			undefined,
			"Kostenpunkt:",
			"Datum:",
			"Bemerkung:",
			"Ausgaben:",
			"Einnahmen:",
		]);
		// Block 1: Kneipen
		expect([cell("A3"), cell("C3"), cell("D3"), cell("E3")]).toEqual([
			"Antrittskneipe",
			"Bier",
			300,
			50,
		]);
		expect([cell("A4"), cell("C4"), cell("D4")]).toEqual([null, "Essen", 120]);
		expect(cell("A5")).toBe("Summe Kneipen");
		expect(cell("D5")).toMatchObject({ formula: "SUM(D3:D4)" });
		expect(cell("E5")).toMatchObject({ formula: "SUM(E3:E4)" });
		// Block 2: a Kostenpunkt without positions exports its cached budget.
		expect([cell("A6"), cell("D6"), cell("E6")]).toEqual(["Putzen", 80, 0]);
		expect(cell("A7")).toBe("Summe Haus");
		// Tail
		expect(cell("A8")).toBe("Summe SS2026");
		expect(cell("D8")).toMatchObject({ formula: "D5+D7" });
		expect(cell("A9")).toBe("Zuschuss AHV");
		expect(cell("D9")).toMatchObject({ formula: "D8-E8" });
	});

	test("reports an unknown plan", async () => {
		await setup();
		expect(await exportEtaplanXlsx("missing")).toEqual({
			success: false,
			error: "Etatplan nicht gefunden",
		});
	});
});

describe("importEtaplanXlsx", () => {
	test("export → import into an empty plan reproduces Kostenpunkte and positions", async () => {
		await setup();
		const source = await createEtaplan();
		await createKostenpunkt(source.id, {
			name: "Antrittskneipe",
			category: "Kneipen",
			categoryOrder: 0,
			displayOrder: 0,
			positionen: [
				{ bemerkung: "Bier", ausgaben: 300, einnahmen: 50 },
				{ bemerkung: "Essen", ausgaben: 120 },
			],
		});
		await createKostenpunkt(source.id, {
			name: "Abschlusskneipe",
			category: "Kneipen",
			categoryOrder: 0,
			displayOrder: 1,
			positionen: [{ bemerkung: "Fass", ausgaben: 200 }],
		});
		await createKostenpunkt(source.id, {
			name: "Putzen",
			category: "Haus",
			categoryOrder: 1,
			positionen: [{ bemerkung: "Mittel", ausgaben: 80, einnahmen: 10 }],
		});
		const target = await createEtaplan();
		const exported = await exportEtaplanXlsx(source.id);
		if (!exported.success) {
			throw new Error(exported.error);
		}

		const result = await importEtaplanXlsx({
			etaplanId: target.id,
			base64: exported.base64,
		});

		expect(result).toMatchObject({
			success: true,
			created: 3,
			updated: 0,
			unchanged: 0,
			errors: [],
			note: undefined,
		});
		expect(await snapshot(target.id)).toEqual(await snapshot(source.id));
	});

	// The import reads `cell.text`, which for a numeric cell is the raw JS
	// number ("12.5"); parseGermanNumber then strips the "." as a thousands
	// separator and books 125 instead of 12.50.
	test.fails("round-trips amounts with cents (#148)", async () => {
		await setup();
		const source = await createEtaplan();
		await createKostenpunkt(source.id, {
			name: "Kneipe",
			category: "Kneipen",
			positionen: [{ bemerkung: "Bier", ausgaben: 12.5, einnahmen: 0.99 }],
		});
		const target = await createEtaplan();
		const exported = await exportEtaplanXlsx(source.id);
		if (!exported.success) {
			throw new Error(exported.error);
		}

		await importEtaplanXlsx({ etaplanId: target.id, base64: exported.base64 });

		expect(await snapshot(target.id)).toEqual(await snapshot(source.id));
	});

	test("merges into an existing plan: updates matches, creates new ones, keeps the rest", async () => {
		await setup();
		const plan = await createEtaplan();
		const matched = await createKostenpunkt(plan.id, {
			name: "Antrittskneipe",
			category: "Kneipen",
			categoryOrder: 5,
			description: "bleibt erhalten",
			positionen: [{ bemerkung: "alt", ausgaben: 999 }],
		});
		await createKostenpunkt(plan.id, {
			name: "Nicht in der Datei",
			category: "Kneipen",
			budget: 7,
		});
		const base64 = await sheet([
			["Antrittskneipe", null, "Bier", "300,00 €", "50"],
			[null, null, "Essen", "1.200,00 €", null],
			["Summe Kneipen"],
			["Neu", null, "Etwas", 15, null],
			["Summe Haus"],
			["Summe SS2026", null, null, 9999, null],
			["Ignoriert", null, null, 1, null],
		]);

		const result = await importEtaplanXlsx({ etaplanId: plan.id, base64 });

		expect(result).toMatchObject({
			success: true,
			created: 1,
			updated: 1,
			unchanged: 1,
			note: "1 bestehende Kostenpunkte waren nicht in der Datei und wurden beibehalten.",
		});
		const [updated] = await tenantDb()
			.select()
			.from(kostenpunkte)
			.where(eq(kostenpunkte.id, matched.id));
		expect(updated).toMatchObject({
			categoryOrder: 0,
			budget: 1500,
			income: 50,
			description: "bleibt erhalten",
		});
		expect(await snapshot(plan.id)).toEqual([
			expect.objectContaining({
				name: "Antrittskneipe",
				positionen: [
					["Bier", 300, 50],
					["Essen", 1200, 0],
				],
			}),
			expect.objectContaining({ name: "Nicht in der Datei", budget: 7 }),
			expect.objectContaining({
				category: "Haus",
				categoryOrder: 1,
				name: "Neu",
				budget: 15,
				positionen: [["Etwas", 15, 0]],
			}),
		]);
	});

	test("lines before any Kostenpunkt and after the last subtotal are kept", async () => {
		await setup();
		const plan = await createEtaplan();
		const base64 = await sheet([
			[null, null, "Ohne Namen", 5, null],
			[null, null, null, null, null],
			["Summe Kneipen"],
			["Rest", null, null, 3, 1],
		]);

		const result = await importEtaplanXlsx({ etaplanId: plan.id, base64 });

		expect(result).toMatchObject({ success: true, created: 2 });
		expect(await snapshot(plan.id)).toEqual([
			{
				category: "Kneipen",
				categoryOrder: 0,
				name: "Ohne Namen",
				budget: 5,
				income: 0,
				positionen: [["Ohne Namen", 5, 0]],
			},
			{
				category: "Sonstiges",
				categoryOrder: 1,
				name: "Rest",
				budget: 3,
				income: 1,
				positionen: [[null, 3, 1]],
			},
		]);
	});

	test("rejects a sheet without Kostenpunkte and an unknown plan", async () => {
		await setup();
		const plan = await createEtaplan();

		expect(
			await importEtaplanXlsx({
				etaplanId: plan.id,
				base64: await sheet([["Summe SS2026"]]),
			}),
		).toEqual({
			success: false,
			error: "Keine Kostenpunkte in der Datei gefunden",
		});
		expect(
			await importEtaplanXlsx({
				etaplanId: "missing",
				base64: await sheet([["X", null, null, 1]]),
			}),
		).toEqual({ success: false, error: "Etatplan nicht gefunden" });
		expect(await tenantDb().select().from(kostenpunkte)).toHaveLength(0);
	});

	test("a corrupt file fails without writing", async () => {
		await setup();
		const plan = await createEtaplan();

		const result = await importEtaplanXlsx({
			etaplanId: plan.id,
			base64: Buffer.from("not a workbook").toString("base64"),
		});

		expect(result).toEqual({ success: false, error: "Import fehlgeschlagen" });
		expect(await tenantDb().select().from(kostenpunkte)).toHaveLength(0);
	});
});
