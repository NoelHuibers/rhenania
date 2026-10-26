"use server";

import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { isValidMarkupPercent, MAX_MARKUP_PERCENT } from "~/lib/pricing";
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
import { FeatureDisabledError, hasFeature } from "~/server/lib/features";
import { groupBy } from "~/server/lib/group-by";
import { updateBillStatus } from "../billings/billings";
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
			if (!lastClosed) {
				return { value: 0, date: null as Date | null };
			}
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
	if (!session?.user?.id) {
		return { success: false, error: "Nicht angemeldet" };
	}

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
	if (!session?.user?.id) {
		return { success: false, error: "Nicht angemeldet" };
	}

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
	if (!session?.user?.id) {
		return { success: false, error: "Nicht angemeldet" };
	}

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
	if (!session?.user?.id) {
		return { success: false, error: "Nicht angemeldet" };
	}

	await db
		.update(externalBills)
		.set({ status: "Bezahlt", paidAt: new Date() })
		.where(eq(externalBills.id, id));
	return { success: true };
}

export async function deleteExternalBill(id: string) {
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Nicht angemeldet" };
	}

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
	if (!session?.user?.id) {
		return { success: false, error: "Nicht angemeldet" };
	}

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

// All group bills (paid ones are listed too), with their items: one round trip.
export async function getOpenEntityBills() {
	const isGroupBill = sql`${bills.userId} LIKE 'event-%'`;
	const [groupBills, items] = await db.batch([
		db
			.select({
				id: bills.id,
				userName: bills.userName,
				total: bills.total,
				status: bills.status,
				createdAt: bills.createdAt,
			})
			.from(bills)
			.where(isGroupBill)
			.orderBy(desc(bills.createdAt)),
		db
			.select({ item: billItems })
			.from(billItems)
			.innerJoin(bills, eq(billItems.billId, bills.id))
			.where(isGroupBill)
			.orderBy(sql`${billItems}.rowid`),
	]);

	const itemsByBill = groupBy(
		items.map((r) => r.item),
		(item) => item.billId,
	);
	return groupBills.map((bill) => ({
		...bill,
		items: itemsByBill.get(bill.id) ?? [],
	}));
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
	if (!session?.user?.id) {
		return { success: false, error: "Nicht angemeldet" };
	}

	const allowed = await hasGetraenkewartRole(session.user.id);
	if (!allowed) {
		return { success: false, error: "Keine Berechtigung" };
	}

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

// ─── Feature settings (markup, bill recipient) ───────────────────────────────
//
// Values behind the `drinks.markup` and `billing.treasurerRecipient` features.
// Every action checks the Getränkewart/Admin role AND the feature flag on the
// server — hiding the card in the UI is not the gate.

type ActionResult = { success: true } | { success: false; error: string };

async function requireGetraenkewart(): Promise<
	{ ok: true; userId: string } | { ok: false; error: string }
> {
	const session = await auth();
	if (!session?.user?.id) {
		return { ok: false, error: "Nicht angemeldet" };
	}
	if (!(await hasGetraenkewartRole(session.user.id))) {
		return { ok: false, error: "Keine Berechtigung" };
	}
	return { ok: true, userId: session.user.id };
}

export type GetraenkeSettings = {
	markupPercent: number;
	billRecipient: "members" | "treasurer";
	treasurerEmail: string;
};

/** Current values, or null when the tenant has neither feature. */
export async function getGetraenkeSettings(): Promise<GetraenkeSettings | null> {
	const [markup, treasurer] = await Promise.all([
		hasFeature("drinks.markup"),
		hasFeature("billing.treasurerRecipient"),
	]);
	if (!markup && !treasurer) {
		return null;
	}

	const [row] = await db
		.select({
			markupPercent: kasseConfig.markupPercent,
			billRecipient: kasseConfig.billRecipient,
			treasurerEmail: kasseConfig.treasurerEmail,
		})
		.from(kasseConfig)
		.where(eq(kasseConfig.id, "singleton"));

	return {
		markupPercent: Number(row?.markupPercent ?? 0),
		billRecipient: row?.billRecipient ?? "members",
		treasurerEmail: row?.treasurerEmail ?? "",
	};
}

export async function setMarkupPercent(value: number): Promise<ActionResult> {
	const gate = await requireGetraenkewart();
	if (!gate.ok) {
		return { success: false, error: gate.error };
	}
	if (!(await hasFeature("drinks.markup"))) {
		return {
			success: false,
			error: new FeatureDisabledError("drinks.markup").message,
		};
	}
	if (!isValidMarkupPercent(value)) {
		return {
			success: false,
			error: `Der Aufschlag muss zwischen 0 und ${MAX_MARKUP_PERCENT} % liegen.`,
		};
	}

	await db
		.insert(kasseConfig)
		.values({ id: "singleton", markupPercent: value, updatedBy: gate.userId })
		.onConflictDoUpdate({
			target: kasseConfig.id,
			set: { markupPercent: value, updatedBy: gate.userId },
		});
	return { success: true };
}

export async function setBillRecipient(
	mode: "members" | "treasurer",
	treasurerEmail: string,
): Promise<ActionResult> {
	const gate = await requireGetraenkewart();
	if (!gate.ok) {
		return { success: false, error: gate.error };
	}
	if (!(await hasFeature("billing.treasurerRecipient"))) {
		return {
			success: false,
			error: new FeatureDisabledError("billing.treasurerRecipient").message,
		};
	}
	if (mode !== "members" && mode !== "treasurer") {
		return { success: false, error: "Ungültiger Empfänger" };
	}

	const email = treasurerEmail.trim();
	if (email && !z.string().email().safeParse(email).success) {
		return { success: false, error: "Ungültige E-Mail-Adresse" };
	}
	if (mode === "treasurer" && !email) {
		return {
			success: false,
			error: "Bitte die E-Mail-Adresse des Kassenwarts eintragen.",
		};
	}

	const values = { billRecipient: mode, treasurerEmail: email || null };
	await db
		.insert(kasseConfig)
		.values({ id: "singleton", ...values, updatedBy: gate.userId })
		.onConflictDoUpdate({
			target: kasseConfig.id,
			set: { ...values, updatedBy: gate.userId },
		});
	return { success: true };
}

// ─── "Alle haben gezahlt" (feature `billing.markAllPaid`) ────────────────────

export async function markAllMemberBillsPaid(): Promise<
	{ success: true; count: number } | { success: false; error: string }
> {
	const gate = await requireGetraenkewart();
	if (!gate.ok) {
		return { success: false, error: gate.error };
	}
	if (!(await hasFeature("billing.markAllPaid"))) {
		return {
			success: false,
			error: new FeatureDisabledError("billing.markAllPaid").message,
		};
	}

	// Same set the Kasse lists as open: unpaid and deferred member bills.
	// Group bills are settled separately and stay untouched.
	const open = await getOpenMemberBills();
	let count = 0;
	for (const bill of open) {
		// Reuse the single-bill path so carried-over predecessor bills are
		// settled exactly as when the Getränkewart marks one bill paid.
		const res = await updateBillStatus(bill.id, "Bezahlt");
		if (res.success) {
			count++;
		}
	}

	if (count < open.length) {
		return {
			success: false,
			error: `${count} von ${open.length} Rechnungen als bezahlt markiert.`,
		};
	}
	return { success: true, count };
}
