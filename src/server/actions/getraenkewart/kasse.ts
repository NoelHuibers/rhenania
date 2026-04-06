"use server";

import { desc, eq, sql } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
	bankEntries,
	billItems,
	bills,
	externalBills,
	inventories,
	inventoryItems,
	kasseConfig,
	roles,
	userRoles,
} from "~/server/db/schema";
import { generateUserBillPDF } from "../billings/createUserPDF";

// ─── Summary ──────────────────────────────────────────────────────────────────

export async function getKasseSummary() {
	const [
		kassenstand,
		lagerwert,
		offeneMitglieder,
		offeneGruppen,
		externOffen,
		pfand,
	] = await Promise.all([
		// Sum of all bank entries
		db
			.select({ total: sql<number>`COALESCE(SUM(${bankEntries.amount}), 0)` })
			.from(bankEntries)
			.then((r) => Number(r[0]?.total ?? 0)),

		// Value of last closed inventory: SUM(countedStock * priceAtCount)
		(async () => {
			const [lastClosed] = await db
				.select({ id: inventories.id, closedAt: inventories.closedAt })
				.from(inventories)
				.where(eq(inventories.status, "closed"))
				.orderBy(desc(inventories.closedAt))
				.limit(1);
			if (!lastClosed) return { value: 0, date: null as Date | null };
			const items = await db
				.select({
					counted: inventoryItems.countedStock,
					price: inventoryItems.priceAtCount,
				})
				.from(inventoryItems)
				.where(eq(inventoryItems.inventoryId, lastClosed.id));
			const value = items.reduce((sum, i) => sum + i.counted * i.price, 0);
			return { value, date: lastClosed.closedAt };
		})(),

		// Open personal member bills
		db
			.select({ total: sql<number>`COALESCE(SUM(${bills.total}), 0)` })
			.from(bills)
			.where(
				sql`${bills.status} = 'Unbezahlt' AND ${bills.userId} NOT LIKE 'event-%'`,
			)
			.then((r) => Number(r[0]?.total ?? 0)),

		// Open entity/group bills
		db
			.select({ total: sql<number>`COALESCE(SUM(${bills.total}), 0)` })
			.from(bills)
			.where(
				sql`${bills.status} = 'Unbezahlt' AND ${bills.userId} LIKE 'event-%'`,
			)
			.then((r) => Number(r[0]?.total ?? 0)),

		// Open external bills
		db
			.select({ total: sql<number>`COALESCE(SUM(${externalBills.amount}), 0)` })
			.from(externalBills)
			.where(eq(externalBills.status, "Offen"))
			.then((r) => Number(r[0]?.total ?? 0)),

		// Pfand from config
		db
			.select({ pfandWert: kasseConfig.pfandWert })
			.from(kasseConfig)
			.where(eq(kasseConfig.id, "singleton"))
			.then((r) => Number(r[0]?.pfandWert ?? 0)),
	]);

	const gesamt =
		kassenstand +
		lagerwert.value +
		offeneMitglieder +
		offeneGruppen +
		pfand -
		externOffen;

	return {
		kassenstand,
		lagerwert: lagerwert.value,
		lagerwertDate: lagerwert.date,
		offeneMitglieder,
		offeneGruppen,
		pfand,
		externOffen,
		gesamt,
	};
}

// ─── Bank Entries ─────────────────────────────────────────────────────────────

export async function getBankEntries() {
	return db.select().from(bankEntries).orderBy(desc(bankEntries.date));
}

export async function addBankEntry(data: {
	amount: number;
	description: string;
	date: Date;
}) {
	const session = await auth();
	if (!session?.user?.id) return { success: false, error: "Nicht angemeldet" };

	await db.insert(bankEntries).values({
		amount: data.amount,
		description: data.description,
		date: data.date,
		createdBy: session.user.id,
	});
	return { success: true };
}

export async function deleteBankEntry(id: string) {
	const session = await auth();
	if (!session?.user?.id) return { success: false, error: "Nicht angemeldet" };

	await db.delete(bankEntries).where(eq(bankEntries.id, id));
	return { success: true };
}

// ─── External Bills ───────────────────────────────────────────────────────────

export async function getExternalBills() {
	return db.select().from(externalBills).orderBy(desc(externalBills.createdAt));
}

export async function addExternalBill(data: {
	creditor: string;
	description: string;
	amount: number;
}) {
	const session = await auth();
	if (!session?.user?.id) return { success: false, error: "Nicht angemeldet" };

	await db.insert(externalBills).values({
		creditor: data.creditor,
		description: data.description,
		amount: data.amount,
		createdBy: session.user.id,
	});
	return { success: true };
}

export async function markExternalBillPaid(id: string) {
	const session = await auth();
	if (!session?.user?.id) return { success: false, error: "Nicht angemeldet" };

	await db
		.update(externalBills)
		.set({ status: "Bezahlt", paidAt: new Date() })
		.where(eq(externalBills.id, id));
	return { success: true };
}

export async function deleteExternalBill(id: string) {
	const session = await auth();
	if (!session?.user?.id) return { success: false, error: "Nicht angemeldet" };

	await db.delete(externalBills).where(eq(externalBills.id, id));
	return { success: true };
}

// ─── Pfand ────────────────────────────────────────────────────────────────────

export async function getPfandWert() {
	const [row] = await db
		.select({ pfandWert: kasseConfig.pfandWert })
		.from(kasseConfig)
		.where(eq(kasseConfig.id, "singleton"));
	return Number(row?.pfandWert ?? 0);
}

export async function setPfandWert(value: number) {
	const session = await auth();
	if (!session?.user?.id) return { success: false, error: "Nicht angemeldet" };

	await db
		.insert(kasseConfig)
		.values({ id: "singleton", pfandWert: value, updatedBy: session.user.id })
		.onConflictDoUpdate({
			target: kasseConfig.id,
			set: { pfandWert: value, updatedBy: session.user.id },
		});
	return { success: true };
}

// ─── Open entity bills (for PDF download) ────────────────────────────────────

export async function getOpenEntityBills() {
	const openBills = await db
		.select({
			id: bills.id,
			userName: bills.userName,
			total: bills.total,
			status: bills.status,
			createdAt: bills.createdAt,
		})
		.from(bills)
		.where(sql`${bills.userId} LIKE 'event-%'`)
		.orderBy(desc(bills.createdAt));

	const withItems = await Promise.all(
		openBills.map(async (bill) => {
			const items = await db
				.select()
				.from(billItems)
				.where(eq(billItems.billId, bill.id));
			return { ...bill, items };
		}),
	);

	return withItems;
}

// ─── Open member bills ────────────────────────────────────────────────────────

export async function getOpenMemberBills() {
	return db
		.select({
			id: bills.id,
			userName: bills.userName,
			total: bills.total,
			status: bills.status,
			createdAt: bills.createdAt,
		})
		.from(bills)
		.where(
			sql`(${bills.status} = 'Unbezahlt' OR ${bills.status} = 'Gestundet') AND ${bills.userId} NOT LIKE 'event-%'`,
		)
		.orderBy(bills.userName);
}

// ─── PDF download for entity bills (Getränkewart only) ───────────────────────

async function hasGetraenkewartRole(userId: string): Promise<boolean> {
	const [row] = await db
		.select({ roleId: userRoles.roleId })
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(
			sql`${userRoles.userId} = ${userId} AND (${roles.name} = 'Getränkewart' OR ${roles.name} = 'Admin')`,
		)
		.limit(1);
	return !!row;
}

export async function downloadEntityBillPDF(billId: string): Promise<{
	success: boolean;
	base64?: string;
	fileName?: string;
	error?: string;
}> {
	const session = await auth();
	if (!session?.user?.id) return { success: false, error: "Nicht angemeldet" };

	const allowed = await hasGetraenkewartRole(session.user.id);
	if (!allowed) return { success: false, error: "Keine Berechtigung" };

	const result = await generateUserBillPDF(billId);
	if (!result.success || !result.pdfContent) {
		return {
			success: false,
			error: result.error ?? "PDF-Generierung fehlgeschlagen",
		};
	}

	return {
		success: true,
		base64: result.pdfContent.toString("base64"),
		fileName: result.fileName,
	};
}
