// repo.ts — the Getränke bills in the tenant DB (#33).
//
// Drizzle reads and writes of bill periods, bills, bill items and their
// stored CSVs/PDFs. Every function takes the database it runs on; none
// checks the caller, applies a rule or revalidates a page (that is the
// service's and the action's job). A read that may find nothing returns
// null or []; a failed query throws.

import "server-only";

import {
	and,
	desc,
	eq,
	inArray,
	isNull,
	lt,
	ne,
	not,
	or,
	sql,
} from "drizzle-orm";
import { controlDb } from "~/server/db/control";
import { tenantMemberships } from "~/server/db/control-schema";
import {
	billCSVs,
	billItems,
	billPDFs,
	billPeriods,
	bills,
	drinks,
	orders,
	roles,
	userPreferences,
	userRoles,
	users,
} from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";
import {
	insertChunks,
	unchangedSince,
	writeBatch,
} from "~/server/lib/billing-batch";
import { carriedBillRefusal, paidAlongWith } from "~/server/lib/carried-bills";

export type Bill = typeof bills.$inferSelect;
export type BillStatus = Bill["status"];
type BillRow = typeof bills.$inferInsert;
type BillItemRow = typeof billItems.$inferInsert;

/** Bills whose amount is still owed (and therefore carried forward). */
const isOutstanding = () =>
	or(eq(bills.status, "Unbezahlt"), eq(bills.status, "Gestundet"));

// ─── The billing run ─────────────────────────────────────────────────────────

/**
 * Everything a run computes from, in one round trip: the unbilled orders,
 * the bill numbers taken with `billNumberPrefix`, the open period, every
 * outstanding bill and the holders of `umlageRole`.
 */
export async function readRunState(
	db: TenantDb,
	{
		billNumberPrefix,
		umlageRole,
	}: { billNumberPrefix: string; umlageRole: string },
) {
	const [unbilledOrders, numbered, [lastOpenPeriod], outstanding, holders] =
		await db.batch([
			// Both personal and event orders.
			db
				.select()
				.from(orders)
				.where(eq(orders.inBill, false))
				.orderBy(orders.userId, orders.createdAt),
			db
				.select({ billNumber: billPeriods.billNumber })
				.from(billPeriods)
				.where(sql`${billPeriods.billNumber} LIKE ${`${billNumberPrefix}%`}`),
			db
				.select({ id: billPeriods.id })
				.from(billPeriods)
				.where(isNull(billPeriods.closedAt))
				.orderBy(desc(billPeriods.createdAt))
				.limit(1),
			// From ALL previous periods, not just the last one: a member
			// without new orders gets skipped by intermediate billing runs, so
			// their debt can sit several periods back. Oldest first, with the
			// member's current name for a carry-only bill.
			db
				.select({
					id: bills.id,
					userId: bills.userId,
					userName: bills.userName,
					memberName: users.name,
					total: bills.total,
					status: bills.status,
				})
				.from(bills)
				.leftJoin(users, eq(users.id, bills.userId))
				.where(isOutstanding())
				.orderBy(bills.createdAt, sql`${bills}.rowid`),
			db
				.selectDistinct({ id: users.id, name: users.name })
				.from(userRoles)
				.innerJoin(roles, eq(userRoles.roleId, roles.id))
				.innerJoin(users, eq(userRoles.userId, users.id))
				.where(eq(roles.name, umlageRole)),
		]);
	return {
		unbilledOrders,
		billNumbers: numbered.map((p) => p.billNumber),
		lastOpenPeriodId: lastOpenPeriod?.id ?? null,
		outstanding,
		roleHolders: holders,
	};
}

export type RunState = Awaited<ReturnType<typeof readRunState>>;

/** Which of `userIds` are active members of the tenant (control DB). */
export async function activeMemberIds(
	tenantId: string,
	userIds: string[],
): Promise<Set<string>> {
	const active = await controlDb
		.select({ userId: tenantMemberships.userId })
		.from(tenantMemberships)
		.where(
			and(
				eq(tenantMemberships.tenantId, tenantId),
				eq(tenantMemberships.status, "active"),
				inArray(tenantMemberships.userId, userIds),
			),
		);
	return new Set(active.map((m) => m.userId));
}

export type RunWrite = {
	period: {
		id: string;
		billNumber: string;
		totalAmount: number;
		createdBy: string;
		now: Date;
	};
	/** What the run read, re-checked by the write. */
	read: Pick<RunState, "outstanding" | "lastOpenPeriodId">;
	bills: (BillRow & { id: string })[];
	items: BillItemRow[];
	/** Members whose outstanding bills move into their new one. */
	settledUserIds: string[];
	orderIds: string[];
};

/**
 * Writes a run as one atomic batch: one round trip, and the write lock is
 * held only while the batch runs. The batch fails (and rolls back) on a
 * constraint of `bill_period.bill_number` when another run took the bill
 * number or the data read has changed meanwhile.
 */
export async function writeRun(db: TenantDb, run: RunWrite): Promise<void> {
	const { period, read } = run;
	const { now } = period;
	await writeBatch(db, [
		db.insert(billPeriods).values({
			id: period.id,
			billNumber: period.billNumber,
			totalAmount: period.totalAmount,
			createdBy: period.createdBy,
			createdAt: now,
			updatedAt: now,
		}),
		// The optimistic check, before anything else changes: a NULL bill
		// number violates NOT NULL and fails the whole batch.
		db
			.update(billPeriods)
			.set({ billNumber: sql`NULL` })
			.where(
				and(
					eq(billPeriods.id, period.id),
					not(
						unchangedSince(
							db,
							{ billsTable: bills, outstanding: read.outstanding },
							{
								table: orders,
								stillBillable: and(
									inArray(orders.id, run.orderIds),
									eq(orders.inBill, false),
								),
								count: run.orderIds.length,
							},
						),
					),
				),
			),
		...(read.lastOpenPeriodId
			? [
					db
						.update(billPeriods)
						.set({ closedAt: now, updatedAt: now })
						.where(eq(billPeriods.id, read.lastOpenPeriodId)),
				]
			: []),
		...insertChunks(run.bills).map((rows) => db.insert(bills).values(rows)),
		...insertChunks(run.items).map((rows) => db.insert(billItems).values(rows)),
		// Everything outstanding outside the period being created right now.
		...(run.settledUserIds.length > 0
			? [
					db
						.update(bills)
						.set({ status: "Übertragen", updatedAt: now })
						.where(
							and(
								inArray(bills.userId, run.settledUserIds),
								isOutstanding(),
								ne(bills.billPeriodId, period.id),
							),
						),
				]
			: []),
		...(run.orderIds.length > 0
			? [
					db
						.update(orders)
						.set({ inBill: true, updatedAt: now })
						.where(inArray(orders.id, run.orderIds)),
				]
			: []),
	]);
}

/**
 * Mail address and mail preference of `userIds`; `emailPref` is null for
 * members without a preference row (who get mails).
 */
export async function mailRecipients(db: TenantDb, userIds: string[]) {
	return db
		.select({
			id: users.id,
			email: users.email,
			emailPref: userPreferences.value,
		})
		.from(users)
		.leftJoin(
			userPreferences,
			and(
				eq(userPreferences.userId, users.id),
				eq(userPreferences.key, "notifications.emailEnabled"),
			),
		)
		.where(inArray(users.id, userIds));
}

// ─── Periods and bills ───────────────────────────────────────────────────────

/** Every bill period, newest first. */
export async function listPeriods(db: TenantDb) {
	return db.select().from(billPeriods).orderBy(desc(billPeriods.createdAt));
}

/** A period's bills by name, and all their items, in one round trip. */
export async function periodBillsWithItems(db: TenantDb, billPeriodId: string) {
	const [periodBills, itemRows] = await db.batch([
		db
			.select({
				id: bills.id,
				userId: bills.userId,
				userName: bills.userName,
				status: bills.status,
				oldBillingAmount: bills.oldBillingAmount,
				fees: bills.fees,
				umlage: bills.umlage,
				drinksTotal: bills.drinksTotal,
				total: bills.total,
				createdAt: bills.createdAt,
				paidAt: bills.paidAt,
			})
			.from(bills)
			.where(eq(bills.billPeriodId, billPeriodId))
			.orderBy(bills.userName),
		db
			.select({ item: billItems })
			.from(billItems)
			.innerJoin(bills, eq(billItems.billId, bills.id))
			.where(eq(bills.billPeriodId, billPeriodId))
			.orderBy(sql`${billItems}.rowid`),
	]);
	return { bills: periodBills, items: itemRows.map((r) => r.item) };
}

export async function findBill(
	db: TenantDb,
	billId: string,
): Promise<Bill | null> {
	const [bill] = await db
		.select()
		.from(bills)
		.where(eq(bills.id, billId))
		.limit(1);
	return bill ?? null;
}

/**
 * Why the status of `bill` can't be changed on its own (a carried bill, or
 * one paid through a later bill; see carried-bills), or null.
 */
export async function carriedRefusal(db: TenantDb, bill: Bill) {
	return carriedBillRefusal(db, bills, bill);
}

/**
 * Sets the status of `bill`, in one atomic batch with what it settles:
 * - "payCarried": the member's carried ("Übertragen") bills created before
 *   it are paid too, with the same paidAt;
 * - "reopenSettled": the bills paid along with it are carried again.
 */
export async function setBillStatus(
	db: TenantDb,
	bill: Bill,
	status: Exclude<BillStatus, "Übertragen">,
	now: Date,
	cascade: "payCarried" | "reopenSettled" | null,
): Promise<void> {
	const setStatus = db
		.update(bills)
		.set({
			status,
			paidAt: status === "Bezahlt" ? now : null,
			updatedAt: now,
		})
		.where(eq(bills.id, bill.id));

	if (cascade === "payCarried") {
		await db.batch([
			setStatus,
			db
				.update(bills)
				.set({ status: "Bezahlt", paidAt: now, updatedAt: now })
				.where(
					and(
						eq(bills.userId, bill.userId),
						eq(bills.status, "Übertragen"),
						lt(bills.createdAt, bill.createdAt),
					),
				),
		]);
	} else if (cascade === "reopenSettled" && bill.paidAt) {
		await db.batch([
			setStatus,
			db
				.update(bills)
				.set({ status: "Übertragen", paidAt: null, updatedAt: now })
				.where(paidAlongWith(bills, { ...bill, paidAt: bill.paidAt })),
		]);
	} else {
		await setStatus;
	}
}

/** The member's latest bill with the number and date of its period. */
export async function latestBillOf(db: TenantDb, userId: string) {
	const [latest] = await db
		.select({
			id: bills.id,
			status: bills.status,
			total: bills.total,
			userName: bills.userName,
			createdAt: bills.createdAt,
			billNumber: billPeriods.billNumber,
			periodCreatedAt: billPeriods.createdAt,
		})
		.from(bills)
		.leftJoin(billPeriods, eq(bills.billPeriodId, billPeriods.id))
		.where(eq(bills.userId, userId))
		.orderBy(desc(bills.createdAt))
		.limit(1);
	return latest ?? null;
}

/** The member's latest bill and its period, every column. */
export async function latestBillWithPeriod(db: TenantDb, userId: string) {
	const [latest] = await db
		.select({ bill: bills, billPeriod: billPeriods })
		.from(bills)
		.leftJoin(billPeriods, eq(bills.billPeriodId, billPeriods.id))
		.where(eq(bills.userId, userId))
		.orderBy(desc(bills.createdAt))
		.limit(1);
	return latest ?? null;
}

/** A bill's items, in stored order. */
export async function itemsOf(db: TenantDb, billId: string) {
	return db.select().from(billItems).where(eq(billItems.billId, billId));
}

// ─── Documents (PDF, CSV) ────────────────────────────────────────────────────

/** A bill, its period and its items by drink name, in one round trip. */
export async function billWithPeriodAndItems(db: TenantDb, billId: string) {
	const [[row], items] = await db.batch([
		db
			.select({ bill: bills, billPeriod: billPeriods })
			.from(bills)
			.leftJoin(billPeriods, eq(bills.billPeriodId, billPeriods.id))
			.where(eq(bills.id, billId))
			.limit(1),
		db
			.select()
			.from(billItems)
			.where(eq(billItems.billId, billId))
			.orderBy(billItems.drinkName),
	]);
	return row ? { ...row, items } : null;
}

/**
 * Everything a period's CSV shows, in one round trip: the period, every
 * drink by name, the period's bills and all their items.
 */
export async function periodForCsv(db: TenantDb, billPeriodId: string) {
	const [[period], allDrinks, periodBills, itemRows] = await db.batch([
		db
			.select()
			.from(billPeriods)
			.where(eq(billPeriods.id, billPeriodId))
			.limit(1),
		db
			.select({ name: drinks.name, price: drinks.price })
			.from(drinks)
			.orderBy(drinks.name),
		db.select().from(bills).where(eq(bills.billPeriodId, billPeriodId)),
		db
			.select({ item: billItems })
			.from(billItems)
			.innerJoin(bills, eq(billItems.billId, bills.id))
			.where(eq(bills.billPeriodId, billPeriodId)),
	]);
	return {
		period: period ?? null,
		drinks: allDrinks,
		bills: periodBills,
		items: itemRows.map((r) => r.item),
	};
}

export async function findPeriodCsv(db: TenantDb, billPeriodId: string) {
	const [csv] = await db
		.select()
		.from(billCSVs)
		.where(eq(billCSVs.billPeriodId, billPeriodId))
		.limit(1);
	return csv ?? null;
}

export async function deletePeriodCsv(db: TenantDb, csvId: string) {
	await db.delete(billCSVs).where(eq(billCSVs.id, csvId));
}

export async function insertPeriodCsv(
	db: TenantDb,
	values: typeof billCSVs.$inferInsert,
) {
	const [row] = await db
		.insert(billCSVs)
		.values(values)
		.returning({ id: billCSVs.id });
	return row?.id;
}

export async function findBillPdf(db: TenantDb, billId: string) {
	const [pdf] = await db
		.select()
		.from(billPDFs)
		.where(eq(billPDFs.billId, billId))
		.limit(1);
	return pdf ?? null;
}

export async function deleteBillPdf(db: TenantDb, pdfId: string) {
	await db.delete(billPDFs).where(eq(billPDFs.id, pdfId));
}

export async function insertBillPdf(
	db: TenantDb,
	values: typeof billPDFs.$inferInsert,
) {
	const [row] = await db
		.insert(billPDFs)
		.values(values)
		.returning({ id: billPDFs.id });
	return row?.id;
}
