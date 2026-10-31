"use server";

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
import { z } from "zod";
import { billNumberBase, nextBillNumber } from "~/lib/bill-number";
import { csvRow } from "~/lib/csv";
import { addMoney } from "~/lib/money";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
	fuchsenBillItems,
	fuchsenBillPeriods,
	fuchsenBills,
	fuchsenOrders,
	users,
} from "~/server/db/schema";
import { FUCHSEN_RULES, planBillingRun } from "~/server/domain/billing/plan";
import { ROLES, requireMember, requireRole } from "~/server/lib/authz";
import {
	BILLING_CONFLICT_MESSAGE,
	insertChunks,
	isConstraintOn,
	unchangedSince,
	writeBatch,
} from "~/server/lib/billing-batch";
import {
	carriedBillRefusal,
	memberBillStatus,
	paidAlongWith,
} from "~/server/lib/carried-bills";
import { ActionError, defineAction } from "~/server/lib/define-action";
import { groupBy } from "~/server/lib/group-by";
import { log } from "~/server/lib/log";

export type FuchsenBillPeriod = typeof fuchsenBillPeriods.$inferSelect;
export type FuchsenBill = typeof fuchsenBills.$inferSelect;

// Shape consumed by the generic <BillingTable> component (see BillingDashboard).
export interface FuchsenBillingEntry {
	id: string;
	name: string;
	totalDue: number;
	status?: FuchsenBill["status"];
	oldBillingAmount?: number;
	itemsTotal?: number;
	paidAt?: Date | null;
	items: {
		id: string;
		name: string;
		quantity: number;
		unitPrice: number;
		subtotal: number;
	}[];
}

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

/**
 * Run a new fuchsen billing period, like the drinks billing: every open,
 * not-yet-billed order goes onto one bill per member; whatever a member
 * still owes (or has as credit) from ANY earlier period is carried into
 * their new bill (members with debt but no new orders get a carry-only
 * bill), and the carried bills are closed out as "Übertragen" so the amount
 * is listed and counted once.
 */
export const createNewFuchsenBilling = defineAction(
	{
		roles: ROLES.fuchsen,
		errorMessage: "Fehler beim Erstellen der Rechnungen",
	},
	async ({ user }) => {
		// One read for everything the run computes from (#23).
		const now = new Date();
		const base = billNumberBase(now);
		const [unbilledOrders, numbered, [lastPeriod], outstandingRows] =
			await db.batch([
				// 1. Open orders not yet on a bill.
				db
					.select()
					.from(fuchsenOrders)
					.where(isBillable())
					.orderBy(fuchsenOrders.userId, fuchsenOrders.createdAt),
				db
					.select({ billNumber: fuchsenBillPeriods.billNumber })
					.from(fuchsenBillPeriods)
					.where(sql`${fuchsenBillPeriods.billNumber} LIKE ${`${base}%`}`),
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

		if (unbilledOrders.length === 0) {
			return {
				message: "Keine offenen Bestellungen zum Abrechnen gefunden",
				billsCreated: 0,
				totalAmount: 0,
			};
		}

		// KW-WW-YY (ISO week in Europe/Berlin); further runs in the same week
		// get -2, -3, etc.
		const billNumber = nextBillNumber(
			base,
			numbered.map((p) => p.billNumber),
		);
		const billPeriodId = crypto.randomUUID();

		// 4. Plan the bills: new orders and carried debt per member.
		const plan = planBillingRun({
			unbilledOrders: unbilledOrders.map((o) => ({ ...o, name: o.itemName })),
			outstandingBills: outstandingRows,
			rules: FUCHSEN_RULES,
		});
		const billRows = plan.bills.map(
			(bill): typeof fuchsenBills.$inferInsert => ({
				id: bill.id,
				billPeriodId,
				userId: bill.userId,
				userName: bill.userName,
				status: "Unbezahlt",
				oldBillingAmount: bill.oldBillingAmount,
				itemsTotal: bill.ordersTotal,
				total: bill.total,
				createdAt: now,
			}),
		);
		const itemRows = plan.items.map(
			(line): typeof fuchsenBillItems.$inferInsert => ({
				id: line.id,
				billId: line.billId,
				itemName: line.name,
				amount: line.amount,
				pricePerItem: line.pricePerUnit,
				totalPrice: line.total,
				createdAt: now,
			}),
		);
		// The carried bills of these members now live on in their new one.
		const settledUserIds = plan.settleUserIds;
		// The new orders of each bill.
		const billedOrders = plan.bills
			.filter((bill) => bill.orders.length > 0)
			.map((bill) => ({ billId: bill.id, ids: bill.orders.map((o) => o.id) }));
		const totalBillingAmount = plan.periodTotal;

		// 5. One atomic write. It is refused when another run took the bill
		// number, or (a NULL bill number) when the debts or orders read above
		// changed in the meantime.
		const { orderIds } = plan;
		try {
			await writeBatch(db, [
				db.insert(fuchsenBillPeriods).values({
					id: billPeriodId,
					billNumber,
					totalAmount: totalBillingAmount,
					createdBy: user.id,
					createdAt: now,
					updatedAt: now,
				}),
				db
					.update(fuchsenBillPeriods)
					.set({ billNumber: sql`NULL` })
					.where(
						and(
							eq(fuchsenBillPeriods.id, billPeriodId),
							not(
								unchangedSince(
									db,
									{ billsTable: fuchsenBills, outstanding: outstandingRows },
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
				...(lastPeriod
					? [
							db
								.update(fuchsenBillPeriods)
								.set({ closedAt: now, updatedAt: now })
								.where(eq(fuchsenBillPeriods.id, lastPeriod.id)),
						]
					: []),
				...insertChunks(billRows).map((rows) =>
					db.insert(fuchsenBills).values(rows),
				),
				...insertChunks(itemRows).map((rows) =>
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
										ne(fuchsenBills.billPeriodId, billPeriodId),
									),
								),
						]
					: []),
				...billedOrders.map(({ billId, ids }) =>
					db
						.update(fuchsenOrders)
						.set({ billId, updatedAt: now })
						.where(inArray(fuchsenOrders.id, ids)),
				),
			]);
		} catch (error) {
			if (
				!isConstraintOn(
					error,
					fuchsenBillPeriods,
					fuchsenBillPeriods.billNumber,
				)
			) {
				throw error;
			}
			await log.error("Fuchsen billing conflicted with a concurrent change", {
				err: error,
			});
			throw new ActionError(BILLING_CONFLICT_MESSAGE, "CONFLICT");
		}

		return {
			message: `Erfolgreich ${plan.bills.length} Rechnung(en) erstellt`,
			billsCreated: plan.bills.length,
			totalAmount: totalBillingAmount,
			billPeriod: { id: billPeriodId, billNumber },
		};
	},
);

export async function getAllFuchsenBillPeriods() {
	await requireRole(ROLES.fuchsen);
	try {
		return await db
			.select()
			.from(fuchsenBillPeriods)
			.orderBy(desc(fuchsenBillPeriods.createdAt));
	} catch (error) {
		await log.error("Error getting fuchsen bill periods", { err: error });
		return [];
	}
}

/**
 * Runs the bill query together with the items of every bill matching
 * `billFilter` (one round trip) and groups the items by bill.
 */
async function withFuchsenItems<T>(
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
		(itemRows as Array<{ item: typeof fuchsenBillItems.$inferSelect }>).map(
			(r) => r.item,
		),
		(item) => item.billId,
	);
	return [billRows as T, itemsByBill] as const;
}

export async function getFuchsenBillsForPeriod(
	billPeriodId: string,
): Promise<FuchsenBillingEntry[]> {
	await requireRole(ROLES.fuchsen);
	try {
		// Bills and all their items in one round trip.
		const [billsData, itemsByBill] = await withFuchsenItems(
			db
				.select()
				.from(fuchsenBills)
				.where(eq(fuchsenBills.billPeriodId, billPeriodId))
				.orderBy(fuchsenBills.userName),
			eq(fuchsenBills.billPeriodId, billPeriodId),
		);

		return billsData.map((bill) => {
			const items = itemsByBill.get(bill.id) ?? [];
			return {
				id: bill.id,
				name: bill.userName,
				totalDue: bill.total,
				status: bill.status,
				oldBillingAmount: bill.oldBillingAmount,
				itemsTotal: bill.itemsTotal,
				paidAt: bill.paidAt,
				items: items.map((item) => ({
					id: item.id,
					name: item.itemName,
					quantity: item.amount,
					unitPrice: item.pricePerItem,
					subtotal: item.totalPrice,
				})),
			};
		});
	} catch (error) {
		await log.error("Error getting fuchsen bills for period", { err: error });
		return [];
	}
}

/**
 * Per-user aggregation of orders that haven't been billed yet — drives the
 * "Aktuelle Bestellungen" tab (preview of the next billing run).
 */
export async function getUnbilledFuchsenOrdersGrouped(): Promise<
	FuchsenBillingEntry[]
> {
	await requireRole(ROLES.fuchsen);
	try {
		const orders = await db
			.select()
			.from(fuchsenOrders)
			.where(isBillable())
			.orderBy(fuchsenOrders.userName, fuchsenOrders.createdAt);

		const byUser = new Map<string, FuchsenBillingEntry>();
		for (const order of orders) {
			const entry = byUser.get(order.userId) ?? {
				id: order.userId,
				name: order.userName,
				totalDue: 0,
				items: [],
			};
			entry.totalDue = addMoney(entry.totalDue, order.total);
			const existing = entry.items.find(
				(i) => i.name === order.itemName && i.unitPrice === order.pricePerUnit,
			);
			if (existing) {
				existing.quantity += order.amount;
				existing.subtotal = addMoney(existing.subtotal, order.total);
			} else {
				entry.items.push({
					id: order.id,
					name: order.itemName,
					quantity: order.amount,
					unitPrice: order.pricePerUnit,
					subtotal: order.total,
				});
			}
			byUser.set(order.userId, entry);
		}

		return Array.from(byUser.values()).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
	} catch (error) {
		await log.error("Error grouping unbilled fuchsen orders", { err: error });
		return [];
	}
}

export const updateFuchsenBillStatus = defineAction(
	{
		roles: ROLES.fuchsen,
		schema: z.tuple([
			z.string(),
			z.enum(["Bezahlt", "Unbezahlt", "Gestundet"]),
		]),
		errorMessage: "Fehler beim Aktualisieren des Status",
	},
	async ([billId, newStatus]) => {
		const [bill] = await db
			.select()
			.from(fuchsenBills)
			.where(eq(fuchsenBills.id, billId))
			.limit(1);
		if (!bill) {
			throw new ActionError("Rechnung nicht gefunden", "NOT_FOUND");
		}
		// A carried bill is settled (and reopened) through the bill it was
		// rolled into.
		const refusal = await carriedBillRefusal(db, fuchsenBills, bill);
		if (refusal) {
			throw new ActionError(refusal, "CARRIED_BILL");
		}
		// Paying a paid bill again would move its paidAt away from the bills
		// it settled, and with it the link to them.
		if (bill.status === newStatus) {
			return;
		}

		const now = new Date();
		const paidAt = newStatus === "Bezahlt" ? now : null;

		// One atomic batch (#23). Keep the underlying orders in sync so the
		// per-order views (profile) and the bill-level status never disagree.
		const statements: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
			db
				.update(fuchsenBills)
				.set({ status: newStatus, paidAt, updatedAt: now })
				.where(eq(fuchsenBills.id, billId)),
			db
				.update(fuchsenOrders)
				.set({
					status: newStatus === "Bezahlt" ? "Bezahlt" : "Offen",
					paidAt,
					updatedAt: now,
				})
				.where(eq(fuchsenOrders.billId, billId)),
		];
		if (newStatus === "Bezahlt" && bill.status !== "Bezahlt") {
			// Paying a consolidated bill also pays the bills it carried.
			statements.push(
				...setCarriedBills(bill, {
					from: memberBillStatus(fuchsenBills, "Übertragen"),
					status: "Bezahlt",
					paidAt: now,
					now,
				}),
			);
		} else if (
			newStatus !== "Bezahlt" &&
			bill.status === "Bezahlt" &&
			bill.paidAt
		) {
			// Undoing a payment reopens the carried bills paid along with it.
			statements.push(
				...setCarriedBills(bill, {
					from: paidAlongWith(fuchsenBills, {
						...bill,
						paidAt: bill.paidAt,
					}),
					status: "Übertragen",
					paidAt: null,
					now,
				}),
			);
		}
		await db.batch(statements);
	},
);

/**
 * Statements that move the member's earlier bills matching `from` (the ones
 * carried into `bill`) to `status`, together with their orders. The orders
 * go first, while their bills still match `from`.
 */
function setCarriedBills(
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

/** The current user's own fuchsen bills (newest first), with line items. */
export async function getMyFuchsenBills(): Promise<
	{ period: FuchsenBillPeriod | null; bill: FuchsenBillingEntry }[]
> {
	await requireMember();
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return [];
		}

		const [rows, itemsByBill] = await withFuchsenItems(
			db
				.select({ bill: fuchsenBills, period: fuchsenBillPeriods })
				.from(fuchsenBills)
				.leftJoin(
					fuchsenBillPeriods,
					eq(fuchsenBills.billPeriodId, fuchsenBillPeriods.id),
				)
				.where(eq(fuchsenBills.userId, session.user.id))
				.orderBy(desc(fuchsenBills.createdAt)),
			eq(fuchsenBills.userId, session.user.id),
		);

		return rows.map(({ bill, period }) => {
			const items = itemsByBill.get(bill.id) ?? [];
			return {
				period,
				bill: {
					id: bill.id,
					name: bill.userName,
					totalDue: bill.total,
					status: bill.status,
					oldBillingAmount: bill.oldBillingAmount,
					itemsTotal: bill.itemsTotal,
					paidAt: bill.paidAt,
					items: items.map((item) => ({
						id: item.id,
						name: item.itemName,
						quantity: item.amount,
						unitPrice: item.pricePerItem,
						subtotal: item.totalPrice,
					})),
				},
			};
		});
	} catch (error) {
		await log.error("Error getting my fuchsen bills", { err: error });
		return [];
	}
}

/** On-demand CSV (semicolon-delimited) for a whole period; no blob storage. */
export const getFuchsenBillPeriodCSV = defineAction(
	{
		roles: ROLES.fuchsen,
		schema: z.tuple([z.string()]),
		errorMessage: "Fehler beim Erstellen der CSV",
	},
	async ([billPeriodId]) => {
		const [period] = await db
			.select()
			.from(fuchsenBillPeriods)
			.where(eq(fuchsenBillPeriods.id, billPeriodId))
			.limit(1);
		if (!period) {
			throw new ActionError("Periode nicht gefunden", "NOT_FOUND");
		}

		const billsData = await db
			.select()
			.from(fuchsenBills)
			.where(eq(fuchsenBills.billPeriodId, billPeriodId))
			.orderBy(fuchsenBills.userName);

		const fmt = (n: number) => n.toFixed(2).replace(".", ",");
		const lines = [
			csvRow(["Name", "Status", "Artikel", "Alter Saldo", "Gesamt"], ";"),
			...billsData.map((b) =>
				csvRow(
					[
						b.userName,
						b.status,
						fmt(b.itemsTotal),
						fmt(b.oldBillingAmount),
						fmt(b.total),
					],
					";",
				),
			),
			csvRow(["Gesamt", "", "", "", fmt(period.totalAmount)], ";"),
		];

		return {
			csvContent: `﻿${lines.join("\r\n")}`,
			fileName: `Fuchsenrechnung_${period.billNumber}.csv`,
		};
	},
);
