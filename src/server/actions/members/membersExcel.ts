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
	COL,
	HEADER_ROW,
	HEADERS,
	parseBool,
	parseStatus,
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

		const keys = Object.keys(COL) as (keyof typeof COL)[];
		for (const k of keys) {
			ws.getCell(HEADER_ROW, COL[k]).value = HEADERS[k];
			ws.getColumn(COL[k]).width = 18;
		}
		ws.getRow(HEADER_ROW).font = { bold: true };

		let r = BODY_START_ROW;
		for (const m of rows) {
			ws.getCell(r, COL.lastName).value = m.lastName;
			ws.getCell(r, COL.firstName).value = m.firstName;
			ws.getCell(r, COL.status).value = m.status;
			ws.getCell(r, COL.email).value = m.email ?? "";
			ws.getCell(r, COL.street).value = m.street ?? "";
			ws.getCell(r, COL.houseNumber).value = m.houseNumber ?? "";
			ws.getCell(r, COL.postalCode).value = m.postalCode ?? "";
			ws.getCell(r, COL.city).value = m.city ?? "";
			ws.getCell(r, COL.country).value = m.country ?? "";
			ws.getCell(r, COL.lettersOptOut).value = boolToCell(m.lettersOptOut);
			ws.getCell(r, COL.addressNeedsUpdate).value = boolToCell(
				m.addressNeedsUpdate,
			);
			r++;
		}

		const buffer = await wb.xlsx.writeBuffer();
		const base64 = Buffer.from(buffer).toString("base64");
		return { success: true as const, base64, fileName: "Adressliste.xlsx" };
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

		const text = (row: number, col: number) =>
			String(ws.getCell(row, col).text ?? "").trim();

		// Existing members for upsert matching.
		const existing = await db.select().from(members);
		const byEmail = new Map<string, string>();
		const byName = new Map<string, string>();
		for (const m of existing) {
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
			const lastName = text(row, COL.lastName);
			const firstName = text(row, COL.firstName);
			if (!lastName && !firstName) continue;

			const statusRaw = text(row, COL.status);
			const status = parseStatus(statusRaw);
			if (!status) {
				errors.push(`Zeile ${row}: unbekannter Status "${statusRaw}"`);
				skipped++;
				continue;
			}
			if (!lastName || !firstName) {
				errors.push(`Zeile ${row}: Name unvollständig`);
				skipped++;
				continue;
			}

			const email = text(row, COL.email) || null;
			const values = {
				status,
				firstName,
				lastName,
				email,
				street: text(row, COL.street) || null,
				houseNumber: text(row, COL.houseNumber) || null,
				postalCode: text(row, COL.postalCode) || null,
				city: text(row, COL.city) || null,
				country: text(row, COL.country) || "Deutschland",
				lettersOptOut: parseBool(text(row, COL.lettersOptOut)),
				addressNeedsUpdate: parseBool(text(row, COL.addressNeedsUpdate)),
			};

			const nameKey = `${lastName.toLowerCase()}|${firstName.toLowerCase()}`;
			const matchId =
				(email ? byEmail.get(email.toLowerCase()) : undefined) ??
				byName.get(nameKey);

			if (matchId) {
				await db
					.update(members)
					.set({ ...values, updatedBy: guard.userId })
					.where(eq(members.id, matchId));
				updated++;
			} else {
				const [ins] = await db
					.insert(members)
					.values({
						...values,
						createdBy: guard.userId,
						updatedBy: guard.userId,
					})
					.returning({ id: members.id });
				if (ins) {
					if (email) byEmail.set(email.toLowerCase(), ins.id);
					byName.set(nameKey, ins.id);
				}
				created++;
			}
		}

		// Auto-link accounts: unlinked members whose email matches a user.
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
