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
import { billNumberBase, nextBillNumber } from "~/lib/bill-number";
import { csvRow } from "~/lib/csv";
import {
	addMoney,
	fromCents,
	roundToCent,
	sumMoney,
	toCents,
} from "~/lib/money";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
	fuchsenBillItems,
	fuchsenBillPeriods,
	fuchsenBills,
	fuchsenOrders,
} from "~/server/db/schema";
import { ROLES, requireMember, requireRole } from "~/server/lib/authz";
import {
	BILLING_CONFLICT_MESSAGE,
	insertChunks,
	isConstraintOn,
	unchangedSince,
	writeBatch,
} from "~/server/lib/billing-batch";
import { carriedBillRefusal } from "~/server/lib/carried-bills";
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

async function requireFuchsenwart() {
	const session = await auth();
	if (!session?.user?.id) {
		return { ok: false as const, error: "Authentifizierung erforderlich" };
	}
	// The session's roles are this Corps' roles of an active member.
	if (!ROLES.fuchsen.some((role) => session.user.roles.includes(role))) {
		return { ok: false as const, error: "Keine Berechtigung" };
	}
	return { ok: true as const, userId: session.user.id };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type FuchsenOrderRow = typeof fuchsenOrders.$inferSelect;

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
 * What each member still owes from ALL earlier periods, in whole cents. A
 * member without new orders is skipped by intermediate runs, so their debt
 * can sit several periods back.
 */
function outstandingByUser(
	rows: { userId: string; userName: string; total: number }[],
) {
	const byUser = new Map<string, { cents: number; userName: string }>();
	for (const row of rows) {
		const entry = byUser.get(row.userId) ?? {
			cents: 0,
			userName: row.userName,
		};
		entry.cents += toCents(Number(row.total) || 0);
		byUser.set(row.userId, entry);
	}
	return byUser;
}

/** One bill line per item and price, consolidating repeated orders. */
function billItemRows(
	billId: string,
	orders: FuchsenOrderRow[],
	now: Date,
): (typeof fuchsenBillItems.$inferInsert)[] {
	const itemSummary = new Map<
		string,
		{ name: string; amount: number; price: number; total: number }
	>();
	for (const order of orders) {
		const key = `${order.itemName}-${order.pricePerUnit}`;
		const existing = itemSummary.get(key);
		if (existing) {
			existing.amount += order.amount;
			existing.total = addMoney(existing.total, order.total);
		} else {
			itemSummary.set(key, {
				name: order.itemName,
				amount: order.amount,
				price: order.pricePerUnit,
				total: roundToCent(order.total),
			});
		}
	}
	return [...itemSummary.values()].map((info) => ({
		id: crypto.randomUUID(),
		billId,
		itemName: info.name,
		amount: info.amount,
		pricePerItem: info.price,
		totalPrice: info.total,
		createdAt: now,
	}));
}

/**
 * Run a new fuchsen billing period, like the drinks billing: every open,
 * not-yet-billed order goes onto one bill per member; whatever a member
 * still owes from ANY earlier period is carried into their new bill (members
 * with debt but no new orders get a carry-only bill), and the carried bills
 * are closed out as "Übertragen" so the debt is listed and counted once.
 */
export async function createNewFuchsenBilling() {
	const authCheck = await requireFuchsenwart();
	if (!authCheck.ok) {
		return { success: false, message: authCheck.error, billsCreated: 0 };
	}

	try {
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
				// 3. Debt from all earlier periods.
				db
					.select({
						id: fuchsenBills.id,
						userId: fuchsenBills.userId,
						userName: fuchsenBills.userName,
						total: fuchsenBills.total,
						status: fuchsenBills.status,
					})
					.from(fuchsenBills)
					.where(isOutstanding()),
			]);

		if (unbilledOrders.length === 0) {
			return {
				success: true,
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
		const outstanding = outstandingByUser(outstandingRows);
		const billPeriodId = crypto.randomUUID();

		// 4. Group the new orders by member.
		const userOrderMap = new Map<string, FuchsenOrderRow[]>();
		for (const order of unbilledOrders) {
			const list = userOrderMap.get(order.userId) ?? [];
			list.push(order);
			userOrderMap.set(order.userId, list);
		}

		// Every member who gets a bill: new orders and/or carried debt.
		const billedUsers = new Map<string, string>();
		for (const [userId, userOrders] of userOrderMap) {
			billedUsers.set(userId, userOrders[0]?.userName ?? "");
		}
		for (const [userId, debt] of outstanding) {
			if (debt.cents > 0 && !billedUsers.has(userId)) {
				billedUsers.set(userId, debt.userName);
			}
		}

		const billRows: (typeof fuchsenBills.$inferInsert)[] = [];
		const itemRows: (typeof fuchsenBillItems.$inferInsert)[] = [];
		// The carried bills of these members now live on in their new one.
		const settledUserIds: string[] = [];
		// The new orders of each bill.
		const billedOrders: { billId: string; ids: string[] }[] = [];
		let totalBillingCents = 0;
		for (const [userId, userName] of billedUsers) {
			const userOrders = userOrderMap.get(userId) ?? [];
			const debtCents = Math.max(0, outstanding.get(userId)?.cents ?? 0);
			const itemsTotal = sumMoney(userOrders.map((o) => o.total));
			const oldBillingAmount = fromCents(debtCents);
			const total = sumMoney([itemsTotal, oldBillingAmount]);

			const billId = crypto.randomUUID();
			billRows.push({
				id: billId,
				billPeriodId,
				userId,
				userName,
				status: "Unbezahlt",
				oldBillingAmount,
				itemsTotal,
				total,
				createdAt: now,
			});
			if (outstanding.has(userId)) {
				settledUserIds.push(userId);
			}
			if (userOrders.length > 0) {
				itemRows.push(...billItemRows(billId, userOrders, now));
				billedOrders.push({ billId, ids: userOrders.map((o) => o.id) });
			}
			totalBillingCents += toCents(total);
		}
		const totalBillingAmount = fromCents(totalBillingCents);

		// 5. One atomic write. It is refused when another run took the bill
		// number, or (a NULL bill number) when the debts or orders read above
		// changed in the meantime.
		const orderIds = unbilledOrders.map((o) => o.id);
		try {
			await writeBatch([
				db.insert(fuchsenBillPeriods).values({
					id: billPeriodId,
					billNumber,
					totalAmount: totalBillingAmount,
					createdBy: authCheck.userId,
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
			return {
				success: false,
				message: BILLING_CONFLICT_MESSAGE,
				billsCreated: 0,
			};
		}

		return {
			success: true,
			message: `Erfolgreich ${billedUsers.size} Rechnung(en) erstellt`,
			billsCreated: billedUsers.size,
			totalAmount: totalBillingAmount,
			billPeriod: { id: billPeriodId, billNumber },
		};
	} catch (error) {
		await log.error("Error creating fuchsen billing", { err: error });
		return {
			success: false,
			message: "Fehler beim Erstellen der Rechnungen",
			billsCreated: 0,
		};
	}
}

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

export async function updateFuchsenBillStatus(
	billId: string,
	newStatus: "Bezahlt" | "Unbezahlt" | "Gestundet",
) {
	const authCheck = await requireFuchsenwart();
	if (!authCheck.ok) {
		return { success: false, error: authCheck.error };
	}
	try {
		const [bill] = await db
			.select()
			.from(fuchsenBills)
			.where(eq(fuchsenBills.id, billId))
			.limit(1);
		if (!bill) {
			return { success: false, error: "Rechnung nicht gefunden" };
		}
		// A carried bill is settled (and reopened) through the bill it was
		// rolled into.
		const refusal = await carriedBillRefusal(fuchsenBills, bill);
		if (refusal) {
			return { success: false, error: refusal };
		}
		// Paying a paid bill again would move its paidAt away from the bills
		// it settled, and with it the link to them.
		if (bill.status === newStatus) {
			return { success: true };
		}

		const now = new Date();
		const paidAt = newStatus === "Bezahlt" ? now : null;

		await db.transaction(async (tx) => {
			await tx
				.update(fuchsenBills)
				.set({ status: newStatus, paidAt, updatedAt: now })
				.where(eq(fuchsenBills.id, billId));

			// Keep the underlying orders in sync so the per-order views (profile)
			// and the bill-level status never disagree.
			await tx
				.update(fuchsenOrders)
				.set({
					status: newStatus === "Bezahlt" ? "Bezahlt" : "Offen",
					paidAt,
					updatedAt: now,
				})
				.where(eq(fuchsenOrders.billId, billId));

			if (newStatus === "Bezahlt" && bill.status !== "Bezahlt") {
				// Paying a consolidated bill also pays the bills it carried.
				await setCarriedBills(tx, bill, {
					from: eq(fuchsenBills.status, "Übertragen"),
					status: "Bezahlt",
					paidAt: now,
					now,
				});
			} else if (
				newStatus !== "Bezahlt" &&
				bill.status === "Bezahlt" &&
				bill.paidAt
			) {
				// Undoing a payment reopens the carried bills paid along with it.
				await setCarriedBills(tx, bill, {
					from: and(
						eq(fuchsenBills.status, "Bezahlt"),
						eq(fuchsenBills.paidAt, bill.paidAt),
					),
					status: "Übertragen",
					paidAt: null,
					now,
				});
			}
		});

		return { success: true };
	} catch (error) {
		await log.error("Error updating fuchsen bill status", { err: error });
		return { success: false, error: "Fehler beim Aktualisieren des Status" };
	}
}

/**
 * Moves the member's earlier bills matching `from` (the ones carried into
 * `bill`) to `status`, together with their orders.
 */
async function setCarriedBills(
	tx: Tx,
	bill: FuchsenBill,
	change: {
		from: SQL | undefined;
		status: "Bezahlt" | "Übertragen";
		paidAt: Date | null;
		now: Date;
	},
) {
	const carried = await tx
		.select({ id: fuchsenBills.id })
		.from(fuchsenBills)
		.where(
			and(
				eq(fuchsenBills.userId, bill.userId),
				lt(fuchsenBills.createdAt, bill.createdAt),
				change.from,
			),
		);
	if (carried.length === 0) {
		return;
	}
	const ids = carried.map((c) => c.id);
	await tx
		.update(fuchsenBills)
		.set({
			status: change.status,
			paidAt: change.paidAt,
			updatedAt: change.now,
		})
		.where(inArray(fuchsenBills.id, ids));
	await tx
		.update(fuchsenOrders)
		.set({
			status: change.status === "Bezahlt" ? "Bezahlt" : "Offen",
			paidAt: change.paidAt,
			updatedAt: change.now,
		})
		.where(inArray(fuchsenOrders.billId, ids));
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
export async function getFuchsenBillPeriodCSV(billPeriodId: string) {
	const authCheck = await requireFuchsenwart();
	if (!authCheck.ok) {
		return { success: false, error: authCheck.error };
	}
	try {
		const [period] = await db
			.select()
			.from(fuchsenBillPeriods)
			.where(eq(fuchsenBillPeriods.id, billPeriodId))
			.limit(1);
		if (!period) {
			return { success: false, error: "Periode nicht gefunden" };
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
			success: true,
			csvContent: `﻿${lines.join("\r\n")}`,
			fileName: `Fuchsenrechnung_${period.billNumber}.csv`,
		};
	} catch (error) {
		await log.error("Error generating fuchsen CSV", { err: error });
		return { success: false, error: "Fehler beim Erstellen der CSV" };
	}
}
