// repo.ts — the Getränkekasse in the tenant DB (#33).
//
// Drizzle reads and writes of the Kasse: bank entries, external bills, the
// `kasse_config` and `getraenke_billing_config` singletons, the
// Getränkekasse kontos and the sums over the bills. Every function takes the
// database it runs on; no auth, no rules, no revalidatePath. A read that
// may find nothing returns null or []; a failed query throws.

import "server-only";

import {
	and,
	asc,
	desc,
	eq,
	exists,
	gt,
	gte,
	inArray,
	ne,
	or,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import {
	bankEntries,
	bills,
	externalBills,
	getraenkeBillingConfig,
	inventories,
	inventoryItems,
	kasseConfig,
	kontos,
} from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";
import type {
	GetraenkeBillingProfile,
	GetraenkekasseKontoRow,
} from "~/server/domain/getraenkekasse/payment";

const SINGLETON = "singleton";

// ─── Summary ─────────────────────────────────────────────────────────────────

/** SUM of bill totals with this status; group bills belong to `event-…` users. */
function sumBills(status: "Unbezahlt" | "Gestundet", group: boolean) {
	const isGroup = group
		? sql`${bills.userId} LIKE 'event-%'`
		: sql`${bills.userId} NOT LIKE 'event-%'`;
	return sql<number>`COALESCE(SUM(CASE WHEN ${bills.status} = ${status} AND ${isGroup} THEN ${bills.total} END), 0)`;
}

/** Sum of all bank entries. */
export async function bankBalance(db: TenantDb): Promise<number> {
	const [row] = await db
		.select({ total: sql<number>`COALESCE(SUM(${bankEntries.amount}), 0)` })
		.from(bankEntries);
	return Number(row?.total ?? 0);
}

/** Value of the last closed inventory: SUM(countedStock * priceAtCount). */
export async function lastInventoryValue(db: TenantDb) {
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
}

/**
 * Open member and group bills, split into due (Unbezahlt) and deferred
 * (Gestundet).
 */
export async function openBillSums(db: TenantDb) {
	const [row] = await db
		.select({
			mitglieder: sumBills("Unbezahlt", false),
			gestundetMitglieder: sumBills("Gestundet", false),
			gruppen: sumBills("Unbezahlt", true),
			gestundetGruppen: sumBills("Gestundet", true),
		})
		.from(bills);
	return {
		mitglieder: Number(row?.mitglieder ?? 0),
		gestundetMitglieder: Number(row?.gestundetMitglieder ?? 0),
		gruppen: Number(row?.gruppen ?? 0),
		gestundetGruppen: Number(row?.gestundetGruppen ?? 0),
	};
}

/** Sum of the open external bills. */
export async function openExternalTotal(db: TenantDb): Promise<number> {
	const [row] = await db
		.select({ total: sql<number>`COALESCE(SUM(${externalBills.amount}), 0)` })
		.from(externalBills)
		.where(eq(externalBills.status, "Offen"));
	return Number(row?.total ?? 0);
}

// ─── Bank entries and external bills ─────────────────────────────────────────

export async function listBankEntries(db: TenantDb) {
	return db.select().from(bankEntries).orderBy(desc(bankEntries.date));
}

export async function insertBankEntry(
	db: TenantDb,
	values: typeof bankEntries.$inferInsert,
) {
	await db.insert(bankEntries).values(values);
}

export async function deleteBankEntry(db: TenantDb, id: string) {
	await db.delete(bankEntries).where(eq(bankEntries.id, id));
}

export async function listExternalBills(db: TenantDb) {
	return db.select().from(externalBills).orderBy(desc(externalBills.createdAt));
}

export async function insertExternalBill(
	db: TenantDb,
	values: typeof externalBills.$inferInsert,
) {
	await db.insert(externalBills).values(values);
}

export async function markExternalBillPaid(
	db: TenantDb,
	id: string,
	paidAt: Date,
) {
	await db
		.update(externalBills)
		.set({ status: "Bezahlt", paidAt })
		.where(eq(externalBills.id, id));
}

export async function deleteExternalBill(db: TenantDb, id: string) {
	await db.delete(externalBills).where(eq(externalBills.id, id));
}

// ─── Config singletons ───────────────────────────────────────────────────────

/** The `kasse_config` row, or null before anything was saved. */
export async function kasseSettings(db: TenantDb) {
	const [row] = await db
		.select({
			pfandWert: kasseConfig.pfandWert,
			markupPercent: kasseConfig.markupPercent,
			billRecipient: kasseConfig.billRecipient,
			treasurerEmail: kasseConfig.treasurerEmail,
		})
		.from(kasseConfig)
		.where(eq(kasseConfig.id, SINGLETON))
		.limit(1);
	return row ?? null;
}

/** Saves `values` into the `kasse_config` row, creating it if needed. */
export async function saveKasseSettings(
	db: TenantDb,
	values: Omit<Partial<typeof kasseConfig.$inferInsert>, "id">,
) {
	await db
		.insert(kasseConfig)
		.values({ id: SINGLETON, ...values })
		.onConflictDoUpdate({ target: kasseConfig.id, set: values });
}

/** The Getränke billing profile, or null while none is stored. */
export async function billingProfile(
	db: TenantDb,
): Promise<GetraenkeBillingProfile | null> {
	const [row] = await db
		.select()
		.from(getraenkeBillingConfig)
		.where(eq(getraenkeBillingConfig.id, SINGLETON))
		.limit(1);
	return row ?? null;
}

export async function saveBillingProfile(
	db: TenantDb,
	values: Omit<typeof getraenkeBillingConfig.$inferInsert, "id">,
) {
	await db
		.insert(getraenkeBillingConfig)
		.values({ id: SINGLETON, ...values })
		.onConflictDoUpdate({ target: getraenkeBillingConfig.id, set: values });
}

/** Active Getränkekasse kontos, oldest first. */
export async function activeKontos(
	db: TenantDb,
): Promise<GetraenkekasseKontoRow[]> {
	return db
		.select({ iban: kontos.iban, paypalLink: kontos.paypalLink })
		.from(kontos)
		.where(
			and(eq(kontos.kasseType, "Getränkekasse"), eq(kontos.isActive, true)),
		)
		.orderBy(asc(kontos.createdAt), sql`rowid`);
}

// ─── Open bills ──────────────────────────────────────────────────────────────

const isGroupBill = sql`${bills.userId} LIKE 'event-%'`;

/**
 * Every open (Unbezahlt or Gestundet) group bill plus the newest `paid`
 * paid ones, in one query, newest first.
 */
export async function openGroupBills(db: TenantDb, paid: number) {
	// Bills of one run share createdAt: newest inserted first, the same
	// order whichever index SQLite picks.
	const newestFirst = [desc(bills.createdAt), desc(sql`${bills}.rowid`)];
	const recentPaid = db
		.select({ id: bills.id })
		.from(bills)
		// Unary + keeps SQLite off bill_status_idx, which would walk every
		// paid member bill; the group bills come from bill_user_nocase_idx.
		.where(and(isGroupBill, sql`+${bills.status} = 'Bezahlt'`))
		.orderBy(...newestFirst)
		.limit(paid);
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
			and(
				isGroupBill,
				or(ne(bills.status, "Bezahlt"), inArray(bills.id, recentPaid)),
			),
		)
		.orderBy(...newestFirst);
}

/** Unpaid and deferred member bills, by name. */
export async function openMemberBills(db: TenantDb) {
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

/**
 * Pays every open member bill that is not a credit, and the carried bills
 * they settle, in one atomic batch. Returns how many open bills were paid.
 */
export async function payOpenMemberBills(
	db: TenantDb,
	now: Date,
): Promise<number> {
	const isOpenMemberBill = and(
		inArray(bills.status, ["Unbezahlt", "Gestundet"]),
		sql`${bills.userId} NOT LIKE 'event-%'`,
		gte(bills.total, 0),
	);
	const later = alias(bills, "later");
	const paid = { status: "Bezahlt" as const, paidAt: now, updatedAt: now };
	const [, settled] = await db.batch([
		// Carried bills first, while the bills they were carried into are
		// still open.
		db
			.update(bills)
			.set(paid)
			.where(
				and(
					eq(bills.status, "Übertragen"),
					exists(
						db
							.select({ one: sql`1` })
							.from(later)
							.where(
								and(
									eq(later.userId, bills.userId),
									inArray(later.status, ["Unbezahlt", "Gestundet"]),
									sql`${later.userId} NOT LIKE 'event-%'`,
									gte(later.total, 0),
									gt(later.createdAt, bills.createdAt),
								),
							),
					),
				),
			),
		db
			.update(bills)
			.set(paid)
			.where(isOpenMemberBill)
			.returning({ id: bills.id }),
	]);
	return settled.length;
}
