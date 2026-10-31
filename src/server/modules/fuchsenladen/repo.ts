// repo.ts — the Fuchsenladen in the tenant DB (#33).
//
// Drizzle reads and writes of items, orders, bill periods, bills, bill
// items and the payment details. Every function takes the database it runs
// on; none checks the caller, applies a rule or revalidates a page (that is
// the service's and the action's job). A read that may find nothing returns
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
	type SQL,
	sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
	fuchsenBillItems,
	fuchsenBillingConfig,
	fuchsenBillPeriods,
	fuchsenBills,
	fuchsenOrders,
	users,
} from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";
import {
	insertChunks,
	unchangedSince,
	writeBatch,
} from "~/server/lib/billing-batch";
import {
	carriedBillRefusal,
	memberBillStatus,
	paidAlongWith,
} from "~/server/lib/carried-bills";
import { groupBy } from "~/server/lib/group-by";

export type FuchsenBillPeriod = typeof fuchsenBillPeriods.$inferSelect;
export type FuchsenBill = typeof fuchsenBills.$inferSelect;
export type FuchsenBillStatus = FuchsenBill["status"];
type FuchsenBillItem = typeof fuchsenBillItems.$inferSelect;
export type FuchsenBillingConfig = typeof fuchsenBillingConfig.$inferSelect;

/**
 * Orders the next billing run picks up: not on a bill yet and still open.
 * Orders already marked paid in the per-member view are settled and must
 * never be billed again (#143).
 */
const isBillable = () =>
	and(isNull(fuchsenOrders.billId), eq(fuchsenOrders.status, "Offen"));

/** Bills whose amount is still owed (and therefore carried forward). */
const isOutstanding = () =>
	or(
		eq(fuchsenBills.status, "Unbezahlt"),
		eq(fuchsenBills.status, "Gestundet"),
	);

// ─── The billing run ─────────────────────────────────────────────────────────

/**
 * Everything a run computes from, in one round trip: the billable orders,
 * the bill numbers taken with `billNumberPrefix`, the open period and every
 * outstanding bill.
 */
export async function readRunState(
	db: TenantDb,
	{ billNumberPrefix }: { billNumberPrefix: string },
) {
	const [unbilledOrders, numbered, [lastPeriod], outstanding] = await db.batch([
		// 1. Open orders not yet on a bill.
		db
			.select()
			.from(fuchsenOrders)
			.where(isBillable())
			.orderBy(fuchsenOrders.userId, fuchsenOrders.createdAt),
		db
			.select({ billNumber: fuchsenBillPeriods.billNumber })
			.from(fuchsenBillPeriods)
			.where(
				sql`${fuchsenBillPeriods.billNumber} LIKE ${`${billNumberPrefix}%`}`,
			),
		// 2. The previous open period, closed by this run.
		db
			.select({ id: fuchsenBillPeriods.id })
			.from(fuchsenBillPeriods)
			.where(isNull(fuchsenBillPeriods.closedAt))
			.orderBy(desc(fuchsenBillPeriods.createdAt))
			.limit(1),
		// 3. Debt (or credit) from all earlier periods, oldest first,
		// with the member's current name for a carry-only bill.
		db
			.select({
				id: fuchsenBills.id,
				userId: fuchsenBills.userId,
				userName: fuchsenBills.userName,
				memberName: users.name,
				total: fuchsenBills.total,
				status: fuchsenBills.status,
			})
			.from(fuchsenBills)
			.leftJoin(users, eq(users.id, fuchsenBills.userId))
			.where(isOutstanding())
			.orderBy(fuchsenBills.createdAt, sql`${fuchsenBills}.rowid`),
	]);
	return {
		unbilledOrders,
		billNumbers: numbered.map((p) => p.billNumber),
		lastOpenPeriodId: lastPeriod?.id ?? null,
		outstanding,
	};
}

export type RunState = Awaited<ReturnType<typeof readRunState>>;

/**
 * One atomic write of a run: the new period, the closed previous one, the
 * bills and their items, the carried bills as "Übertragen" and the billed
 * orders. It is refused (a NULL bill number, see billing-batch) when the
 * debts or orders in `read` changed since they were read.
 */
export async function writeRun(
	db: TenantDb,
	run: {
		period: {
			id: string;
			billNumber: string;
			totalAmount: number;
			createdBy: string;
			now: Date;
		};
		read: RunState;
		bills: (typeof fuchsenBills.$inferInsert)[];
		items: (typeof fuchsenBillItems.$inferInsert)[];
		/** Members whose carried bills now live on in their new one. */
		settledUserIds: string[];
		/** The new orders of each bill. */
		billedOrders: { billId: string; ids: string[] }[];
		orderIds: string[];
	},
) {
	const { period, read, settledUserIds, orderIds } = run;
	const { now } = period;
	await writeBatch(db, [
		db.insert(fuchsenBillPeriods).values({
			id: period.id,
			billNumber: period.billNumber,
			totalAmount: period.totalAmount,
			createdBy: period.createdBy,
			createdAt: now,
			updatedAt: now,
		}),
		db
			.update(fuchsenBillPeriods)
			.set({ billNumber: sql`NULL` })
			.where(
				and(
					eq(fuchsenBillPeriods.id, period.id),
					not(
						unchangedSince(
							db,
							{ billsTable: fuchsenBills, outstanding: read.outstanding },
							{
								table: fuchsenOrders,
								stillBillable: and(
									inArray(fuchsenOrders.id, orderIds),
									isBillable(),
								),
								count: orderIds.length,
							},
						),
					),
				),
			),
		...(read.lastOpenPeriodId
			? [
					db
						.update(fuchsenBillPeriods)
						.set({ closedAt: now, updatedAt: now })
						.where(eq(fuchsenBillPeriods.id, read.lastOpenPeriodId)),
				]
			: []),
		...insertChunks(run.bills).map((rows) =>
			db.insert(fuchsenBills).values(rows),
		),
		...insertChunks(run.items).map((rows) =>
			db.insert(fuchsenBillItems).values(rows),
		),
		...(settledUserIds.length > 0
			? [
					db
						.update(fuchsenBills)
						.set({ status: "Übertragen", updatedAt: now })
						.where(
							and(
								inArray(fuchsenBills.userId, settledUserIds),
								isOutstanding(),
								ne(fuchsenBills.billPeriodId, period.id),
							),
						),
				]
			: []),
		...run.billedOrders.map(({ billId, ids }) =>
			db
				.update(fuchsenOrders)
				.set({ billId, updatedAt: now })
				.where(inArray(fuchsenOrders.id, ids)),
		),
	]);
}

// ─── Periods and bills ───────────────────────────────────────────────────────

/** Every bill period, newest first. */
export async function listPeriods(db: TenantDb) {
	return db
		.select()
		.from(fuchsenBillPeriods)
		.orderBy(desc(fuchsenBillPeriods.createdAt));
}

/**
 * Runs the bill query together with the items of every bill matching
 * `billFilter` (one round trip) and groups the items by bill.
 */
async function withItems<T>(
	db: TenantDb,
	billsQuery: BatchItem<"sqlite"> & PromiseLike<T>,
	billFilter: SQL | undefined,
) {
	const [billRows, itemRows] = await db.batch([
		billsQuery,
		db
			.select({ item: fuchsenBillItems })
			.from(fuchsenBillItems)
			.innerJoin(fuchsenBills, eq(fuchsenBillItems.billId, fuchsenBills.id))
			.where(billFilter)
			.orderBy(sql`${fuchsenBillItems}.rowid`),
	]);
	const itemsByBill = groupBy(
		(itemRows as Array<{ item: FuchsenBillItem }>).map((r) => r.item),
		(item) => item.billId,
	);
	return [billRows as T, itemsByBill] as const;
}

/** A period's bills by name, with their items by bill, in one round trip. */
export async function periodBillsWithItems(db: TenantDb, billPeriodId: string) {
	return withItems(
		db,
		db
			.select()
			.from(fuchsenBills)
			.where(eq(fuchsenBills.billPeriodId, billPeriodId))
			.orderBy(fuchsenBills.userName),
		eq(fuchsenBills.billPeriodId, billPeriodId),
	);
}

/** A member's bills with their periods (newest first) and items by bill. */
export async function memberBillsWithItems(db: TenantDb, userId: string) {
	return withItems(
		db,
		db
			.select({ bill: fuchsenBills, period: fuchsenBillPeriods })
			.from(fuchsenBills)
			.leftJoin(
				fuchsenBillPeriods,
				eq(fuchsenBills.billPeriodId, fuchsenBillPeriods.id),
			)
			.where(eq(fuchsenBills.userId, userId))
			.orderBy(desc(fuchsenBills.createdAt)),
		eq(fuchsenBills.userId, userId),
	);
}

export async function findPeriod(
	db: TenantDb,
	billPeriodId: string,
): Promise<FuchsenBillPeriod | null> {
	const [period] = await db
		.select()
		.from(fuchsenBillPeriods)
		.where(eq(fuchsenBillPeriods.id, billPeriodId))
		.limit(1);
	return period ?? null;
}

/** A period's bills by name, without items. */
export async function periodBills(db: TenantDb, billPeriodId: string) {
	return db
		.select()
		.from(fuchsenBills)
		.where(eq(fuchsenBills.billPeriodId, billPeriodId))
		.orderBy(fuchsenBills.userName);
}

export async function findBill(
	db: TenantDb,
	billId: string,
): Promise<FuchsenBill | null> {
	const [bill] = await db
		.select()
		.from(fuchsenBills)
		.where(eq(fuchsenBills.id, billId))
		.limit(1);
	return bill ?? null;
}

/** Why `bill`'s status can't be changed on its own (see carried-bills). */
export async function carriedRefusal(db: TenantDb, bill: FuchsenBill) {
	return carriedBillRefusal(db, fuchsenBills, bill);
}

/** The bill's period, items (by name) and the payment details, in one round trip. */
export async function billDocument(db: TenantDb, bill: FuchsenBill) {
	const [[period], items, [config]] = await db.batch([
		db
			.select()
			.from(fuchsenBillPeriods)
			.where(eq(fuchsenBillPeriods.id, bill.billPeriodId))
			.limit(1),
		db
			.select()
			.from(fuchsenBillItems)
			.where(eq(fuchsenBillItems.billId, bill.id))
			.orderBy(fuchsenBillItems.itemName),
		configQuery(db),
	]);
	return { period: period ?? null, items, config: config ?? null };
}

/**
 * Statements that move the member's earlier bills matching `from` (the ones
 * carried into `bill`) to `status`, together with their orders. The orders
 * go first, while their bills still match `from`.
 */
function setCarriedBills(
	db: TenantDb,
	bill: FuchsenBill,
	change: {
		from: SQL | undefined;
		status: "Bezahlt" | "Übertragen";
		paidAt: Date | null;
		now: Date;
	},
) {
	const carried = and(
		eq(fuchsenBills.userId, bill.userId),
		lt(fuchsenBills.createdAt, bill.createdAt),
		change.from,
	);
	return [
		db
			.update(fuchsenOrders)
			.set({
				status: change.status === "Bezahlt" ? "Bezahlt" : "Offen",
				paidAt: change.paidAt,
				updatedAt: change.now,
			})
			.where(
				inArray(
					fuchsenOrders.billId,
					db.select({ id: fuchsenBills.id }).from(fuchsenBills).where(carried),
				),
			),
		db
			.update(fuchsenBills)
			.set({
				status: change.status,
				paidAt: change.paidAt,
				updatedAt: change.now,
			})
			.where(carried),
	];
}

/**
 * Sets `bill` to `status` together with its orders, in one atomic batch
 * (#23), so the per-order views (profile) and the bill never disagree.
 * `cascade` also pays the bills carried into it ("payCarried") or reopens
 * the ones paid along with it ("reopenSettled").
 */
export async function setBillStatus(
	db: TenantDb,
	bill: FuchsenBill,
	status: "Bezahlt" | "Unbezahlt" | "Gestundet",
	now: Date,
	cascade: "payCarried" | "reopenSettled" | null,
) {
	const paidAt = status === "Bezahlt" ? now : null;
	const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
		db
			.update(fuchsenBills)
			.set({ status, paidAt, updatedAt: now })
			.where(eq(fuchsenBills.id, bill.id)),
		db
			.update(fuchsenOrders)
			.set({
				status: status === "Bezahlt" ? "Bezahlt" : "Offen",
				paidAt,
				updatedAt: now,
			})
			.where(eq(fuchsenOrders.billId, bill.id)),
	];
	if (cascade === "payCarried") {
		statements.push(
			...setCarriedBills(db, bill, {
				from: memberBillStatus(fuchsenBills, "Übertragen"),
				status: "Bezahlt",
				paidAt: now,
				now,
			}),
		);
	} else if (cascade === "reopenSettled" && bill.paidAt) {
		statements.push(
			...setCarriedBills(db, bill, {
				from: paidAlongWith(fuchsenBills, { ...bill, paidAt: bill.paidAt }),
				status: "Übertragen",
				paidAt: null,
				now,
			}),
		);
	}
	await db.batch(statements);
}

// ─── Orders

/** The orders the next run bills, by member name and time. */
export async function billableOrders(db: TenantDb) {
	return db
		.select()
		.from(fuchsenOrders)
		.where(isBillable())
		.orderBy(fuchsenOrders.userName, fuchsenOrders.createdAt);
}

// ─── Payment details ─────────────────────────────────────────────────────────

/** The single row of the payment details. */
export const CONFIG_ID = "singleton";

const configQuery = (db: TenantDb) =>
	db
		.select()
		.from(fuchsenBillingConfig)
		.where(eq(fuchsenBillingConfig.id, CONFIG_ID))
		.limit(1);

export async function findConfig(
	db: TenantDb,
): Promise<FuchsenBillingConfig | null> {
	const [config] = await configQuery(db);
	return config ?? null;
}

export async function saveConfig(
	db: TenantDb,
	values: Omit<
		typeof fuchsenBillingConfig.$inferInsert,
		"id" | "updatedAt" | "updatedBy"
	>,
	by: { userId: string; now: Date },
) {
	const stamp = { updatedAt: by.now, updatedBy: by.userId };
	await db
		.insert(fuchsenBillingConfig)
		.values({ id: CONFIG_ID, ...values, ...stamp })
		.onConflictDoUpdate({
			target: fuchsenBillingConfig.id,
			set: { ...values, ...stamp },
		});
}
