import { asc } from "drizzle-orm";
import ExcelJS from "exceljs";
import { describe, expect, test } from "vitest";

import { members } from "~/server/db/schema";
import { createMember } from "../../../../test/factories/members";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	switchTenant,
	tenantDb,
} from "../../../../test/harness";
import { COLUMNS, SHEET_NAME } from "./members-excel-map";
import { exportMembersXlsx, importMembersXlsx } from "./membersExcel";

setupTestDatabases();

async function signInEditor() {
	const tenant = await createTenant();
	const user = await createUser({ roles: ["Admin"] });
	signInAs(user);
	return { tenant, user };
}

/** Workbook with a header row and plain string rows. */
async function workbook(headers: string[], rows: (string | Date | number)[][]) {
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet(SHEET_NAME);
	ws.addRow(headers);
	for (const r of rows) {
		ws.addRow(r);
	}
	return Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");
}

async function allMembers() {
	return tenantDb()
		.select()
		.from(members)
		.orderBy(asc(members.lastName), asc(members.firstName));
}

/** Everything that the Excel file is supposed to carry. */
function portable(m: typeof members.$inferSelect) {
	const {
		id: _id,
		userId: _userId,
		createdAt: _createdAt,
		updatedAt: _updatedAt,
		createdBy: _createdBy,
		updatedBy: _updatedBy,
		...rest
	} = m;
	return rest;
}

const fullMember = {
	externalId: "4711",
	status: "IaCBoB",
	firstName: "Max",
	lastName: "Muster",
	title: "Dr.",
	mobile: "+49 170 1234567",
	phonePrivate: "0711 123",
	phonePrivate2: "0711 456",
	email: "max@example.test",
	email2: "max2@example.test",
	email3: "max3@example.test",
	street: "Hauptstraße",
	houseNumber: "12a",
	addressLine2: "c/o Corpshaus",
	postalCode: "01067",
	city: "Dresden",
	country: "Deutschland",
	birthday: "09.03.1975",
	company: "ACME",
	phoneWork: "0711 999",
	phoneWork2: "0711 998",
	forwarding: true,
	lettersOptOut: true,
	addressNeedsUpdate: true,
	notes: "Zahlt bar",
	extra: { Geändert: "2026-01-01", Elementtyp: "Element", Pfad: "/Liste" },
};

describe("exportMembersXlsx", () => {
	test("writes one header row and one row per member, sorted by name", async () => {
		await signInEditor();
		await createMember({ ...fullMember });
		await createMember({ firstName: "Anna", lastName: "Alt", status: "AH" });

		const result = await exportMembersXlsx();

		expect(result).toMatchObject({
			success: true,
			fileName: "Adressliste.xlsx",
		});
		if (!result.success) {
			return;
		}
		const wb = new ExcelJS.Workbook();
		await wb.xlsx.load(
			Buffer.from(result.base64, "base64") as unknown as Parameters<
				typeof wb.xlsx.load
			>[0],
		);
		const ws = wb.getWorksheet(SHEET_NAME);
		if (!ws) {
			throw new Error("sheet missing");
		}
		const header = COLUMNS.map((_, i) => ws.getCell(1, i + 1).text);
		expect(header).toEqual(COLUMNS.map((c) => c.header));
		const col = (h: string) => COLUMNS.findIndex((c) => c.header === h) + 1;
		expect(ws.getCell(2, col("Nachname")).text).toBe("Alt");
		expect(ws.getCell(3, col("Nachname")).text).toBe("Muster");
		// Text cells keep leading zeros.
		expect(ws.getCell(3, col("Adresse privat: PLZ")).text).toBe("01067");
		expect(ws.getCell(3, col("Weiterleitung")).text).toBe("1");
		expect(ws.getCell(2, col("Weiterleitung")).text).toBe("0");
		expect(ws.getCell(3, col("Pfad")).text).toBe("/Liste");
	});
});

describe("importMembersXlsx", () => {
	test("export → import into another tenant reproduces every field", async () => {
		await signInEditor();
		await createMember({ ...fullMember });
		await createMember({ firstName: "Anna", lastName: "Alt", status: "AH" });
		const exported = await exportMembersXlsx();
		if (!exported.success) {
			throw new Error(exported.error);
		}
		const source = (await allMembers()).map(portable);

		const target = await createTenant();
		switchTenant(target);
		signInAs(await createUser({ roles: ["Admin"], tenantId: target.id }));

		const result = await importMembersXlsx({ base64: exported.base64 });

		expect(result).toMatchObject({
			success: true,
			created: 2,
			updated: 0,
			skipped: 0,
			errors: [],
		});
		expect((await allMembers()).map(portable)).toEqual(source);
	});

	test("re-importing an export updates in place instead of duplicating", async () => {
		const { user } = await signInEditor();
		const m = await createMember({ ...fullMember });
		const exported = await exportMembersXlsx();
		if (!exported.success) {
			throw new Error(exported.error);
		}
		await tenantDb().update(members).set({ city: "Geändert" });

		const result = await importMembersXlsx({ base64: exported.base64 });

		expect(result).toMatchObject({ success: true, created: 0, updated: 1 });
		const rows = await allMembers();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			id: m.id,
			city: "Dresden",
			updatedBy: user.id,
		});
	});

	test("matches by ID, then email, then name, and creates the rest", async () => {
		await signInEditor();
		const byId = await createMember({
			externalId: "1",
			firstName: "A",
			lastName: "Id",
		});
		const byEmail = await createMember({
			email: "mail@example.test",
			firstName: "B",
			lastName: "Mail",
		});
		const byName = await createMember({ firstName: "Carl", lastName: "Name" });
		const base64 = await workbook(
			["Nachname", "Vorname", "ID", "E-Mail-Adresse", "Abteilung"],
			[
				["Umbenannt", "A", "1", "", "CB"],
				["Mail", "Bert", "", "MAIL@example.test", "AH"],
				["name", "CARL", "", "", "fux"],
				["Neu", "Nina", "2", "", ""],
			],
		);

		const result = await importMembersXlsx({ base64 });

		expect(result).toMatchObject({ success: true, created: 1, updated: 3 });
		const rows = await allMembers();
		const byIdMap = new Map(
			rows.map((r) => [r.id, [r.lastName, r.firstName, r.status]]),
		);
		expect(rows).toHaveLength(4);
		expect(byIdMap.get(byId.id)).toEqual(["Umbenannt", "A", "CB"]);
		expect(byIdMap.get(byEmail.id)).toEqual(["Mail", "Bert", "AH"]);
		expect(byIdMap.get(byName.id)).toEqual(["name", "CARL", "Fuchs"]);
		expect(rows.find((r) => r.externalId === "2")).toMatchObject({
			lastName: "Neu",
			firstName: "Nina",
			// Blank Abteilung defaults to AH.
			status: "AH",
		});
	});

	test("reads columns by header, keeps unknown columns in extra and parses cells", async () => {
		await signInEditor();
		const base64 = await workbook(
			[
				"Lieblingsbier",
				"Vorname",
				"Geburtstag",
				"Nachname",
				"Nur Email",
				"Weiterleitung",
			],
			[["Pils", "Max", new Date(Date.UTC(1975, 2, 9)), "Muster", "ja", "x"]],
		);

		const result = await importMembersXlsx({ base64 });

		expect(result).toMatchObject({ success: true, created: 1 });
		const [row] = await allMembers();
		expect(row).toMatchObject({
			firstName: "Max",
			lastName: "Muster",
			status: "AH",
			birthday: "09.03.1975",
			lettersOptOut: true,
			forwarding: true,
			country: "Deutschland",
			extra: { Lieblingsbier: "Pils" },
		});
	});

	test("skips rows with half a name and ignores empty rows", async () => {
		await signInEditor();
		const base64 = await workbook(
			["Nachname", "Vorname"],
			[
				["Muster", ""],
				["", ""],
				["", "Max"],
				["Ok", "Otto"],
			],
		);

		const result = await importMembersXlsx({ base64 });

		expect(result).toMatchObject({
			success: true,
			created: 1,
			skipped: 2,
			errors: ["Zeile 2: Name unvollständig", "Zeile 4: Name unvollständig"],
		});
		expect((await allMembers()).map((m) => m.lastName)).toEqual(["Ok"]);
	});

	test("links imported members to existing accounts by email", async () => {
		await signInEditor();
		const account = await createUser({ email: "max@example.test" });
		const base64 = await workbook(
			["Nachname", "Vorname", "E-Mail 2"],
			[["Muster", "Max", "max@example.test"]],
		);

		const result = await importMembersXlsx({ base64 });

		expect(result).toMatchObject({ success: true, created: 1, linked: 1 });
		expect((await allMembers())[0]?.userId).toBe(account.id);
	});

	test("a corrupt file fails without writing", async () => {
		await signInEditor();
		expect(
			await importMembersXlsx({
				base64: Buffer.from("nope").toString("base64"),
			}),
		).toEqual({ success: false, error: "Import fehlgeschlagen" });
		expect(await allMembers()).toHaveLength(0);
	});

	// Import keeps unknown columns in `members.extra` ("lossless round-trip"),
	// but export only writes the three SharePoint keys from COLUMNS. Re-importing
	// the export then overwrites `extra` and the custom columns are gone.
	test.fails("export → import keeps custom extra columns (#149)", async () => {
		await signInEditor();
		await createMember({
			...fullMember,
			extra: { ...fullMember.extra, Lieblingsbier: "Pils" },
		});
		const exported = await exportMembersXlsx();
		if (!exported.success) {
			throw new Error(exported.error);
		}

		await importMembersXlsx({ base64: exported.base64 });

		expect((await allMembers())[0]?.extra).toMatchObject({
			Lieblingsbier: "Pils",
		});
	});

	// Columns missing from the file are written as null/false on matched
	// members, so re-importing the original Corpsverzeichnis (which lacks the
	// app-managed Hausnummer/Notizen/… columns) wipes them.
	test.fails("columns absent from the file leave stored values alone (#149)", async () => {
		await signInEditor();
		await createMember({
			externalId: "4711",
			firstName: "Max",
			lastName: "Muster",
			houseNumber: "12a",
			notes: "Zahlt bar",
			addressNeedsUpdate: true,
		});
		const base64 = await workbook(
			["ID", "Nachname", "Vorname", "Abteilung"],
			[["4711", "Muster", "Max", "AH"]],
		);

		await importMembersXlsx({ base64 });

		expect((await allMembers())[0]).toMatchObject({
			houseNumber: "12a",
			notes: "Zahlt bar",
			addressNeedsUpdate: true,
		});
	});
});
