"use server";

import {
	and,
	desc,
	eq,
	inArray,
	isNull,
	lt,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { billNumberBase, nextBillNumber } from "~/lib/bill-number";
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
import { hasRole } from "../admin/userRoles";

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
	const [isFuchs, isAdmin] = await Promise.all([
		hasRole(session.user.id, "Fuchs"),
		hasRole(session.user.id, "Admin"),
	]);
	if (!isFuchs && !isAdmin) {
		return { ok: false as const, error: "Keine Berechtigung" };
	}
	return { ok: true as const, userId: session.user.id };
}

/**
 * Next bill number in KW-WW-YY format (ISO week in Europe/Berlin); further
 * runs in the same week get -2, -3, etc.
 */
// biome-ignore lint/suspicious/noExplicitAny: Drizzle transaction type is complex
async function generateBillNumber(tx: any, date: Date): Promise<string> {
	const base = billNumberBase(date);
	const existingBills: { billNumber: string }[] = await tx
		.select({ billNumber: fuchsenBillPeriods.billNumber })
		.from(fuchsenBillPeriods)
		.where(sql`${fuchsenBillPeriods.billNumber} LIKE ${`${base}%`}`);
	return nextBillNumber(
		base,
		existingBills.map((b) => b.billNumber),
	);
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
async function outstandingByUser(tx: Tx) {
	const rows = await tx
		.select({
			userId: fuchsenBills.userId,
			userName: fuchsenBills.userName,
			total: fuchsenBills.total,
		})
		.from(fuchsenBills)
		.where(isOutstanding());
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
async function insertBillItems(
	tx: Tx,
	billId: string,
	orders: FuchsenOrderRow[],
	now: Date,
) {
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
	for (const info of itemSummary.values()) {
		await tx.insert(fuchsenBillItems).values({
			id: crypto.randomUUID(),
			billId,
			itemName: info.name,
			amount: info.amount,
			pricePerItem: info.price,
			totalPrice: info.total,
			createdAt: now,
		});
	}
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
		const result = await db.transaction(async (tx) => {
			// 1. Open orders not yet on a bill.
			const unbilledOrders = await tx
				.select()
				.from(fuchsenOrders)
				.where(isBillable())
				.orderBy(fuchsenOrders.userId, fuchsenOrders.createdAt);

			if (unbilledOrders.length === 0) {
				return {
					success: true,
					message: "Keine offenen Bestellungen zum Abrechnen gefunden",
					billsCreated: 0,
					totalAmount: 0,
				};
			}

			const now = new Date();
			const nextBillNumber = await generateBillNumber(tx, now);

			// 2. Close the previous open period.
			const [lastPeriod] = await tx
				.select({
					id: fuchsenBillPeriods.id,
					closedAt: fuchsenBillPeriods.closedAt,
				})
				.from(fuchsenBillPeriods)
				.where(isNull(fuchsenBillPeriods.closedAt))
				.orderBy(desc(fuchsenBillPeriods.createdAt))
				.limit(1);

			if (lastPeriod && !lastPeriod.closedAt) {
				await tx
					.update(fuchsenBillPeriods)
					.set({ closedAt: now, updatedAt: now })
					.where(eq(fuchsenBillPeriods.id, lastPeriod.id));
			}

			// 3. Debt from all earlier periods, read before the new bills exist.
			const outstanding = await outstandingByUser(tx);

			// 4. Open the new period.
			const billPeriodId = crypto.randomUUID();
			await tx.insert(fuchsenBillPeriods).values({
				id: billPeriodId,
				billNumber: nextBillNumber,
				totalAmount: 0,
				createdBy: authCheck.userId,
				createdAt: now,
			});

			// 5. Group the new orders by member.
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

			let totalBillingCents = 0;
			for (const [userId, userName] of billedUsers) {
				const userOrders = userOrderMap.get(userId) ?? [];
				const debtCents = Math.max(0, outstanding.get(userId)?.cents ?? 0);
				const itemsTotal = sumMoney(userOrders.map((o) => o.total));
				const oldBillingAmount = fromCents(debtCents);
				const total = sumMoney([itemsTotal, oldBillingAmount]);

				const billId = crypto.randomUUID();
				await tx.insert(fuchsenBills).values({
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
					// The carried bills now live on in this one.
					await tx
						.update(fuchsenBills)
						.set({ status: "Übertragen", updatedAt: now })
						.where(
							and(
								eq(fuchsenBills.userId, userId),
								isOutstanding(),
								ne(fuchsenBills.billPeriodId, billPeriodId),
							),
						);
				}

				if (userOrders.length > 0) {
					await insertBillItems(tx, billId, userOrders, now);
					await tx
						.update(fuchsenOrders)
						.set({ billId, updatedAt: now })
						.where(
							inArray(
								fuchsenOrders.id,
								userOrders.map((o) => o.id),
							),
						);
				}

				totalBillingCents += toCents(total);
			}

			const totalBillingAmount = fromCents(totalBillingCents);
			await tx
				.update(fuchsenBillPeriods)
				.set({ totalAmount: totalBillingAmount, updatedAt: now })
				.where(eq(fuchsenBillPeriods.id, billPeriodId));

			return {
				success: true,
				message: `Erfolgreich ${billedUsers.size} Rechnung(en) erstellt`,
				billsCreated: billedUsers.size,
				totalAmount: totalBillingAmount,
				billPeriod: { id: billPeriodId, billNumber: nextBillNumber },
			};
		});

		return result;
	} catch (error) {
		console.error("Error creating fuchsen billing:", error);
		return {
			success: false,
			message: "Fehler beim Erstellen der Rechnungen",
			billsCreated: 0,
		};
	}
}

export async function getLatestFuchsenBillPeriod() {
	try {
		const [latest] = await db
			.select()
			.from(fuchsenBillPeriods)
			.orderBy(desc(fuchsenBillPeriods.createdAt))
			.limit(1);
		return latest ?? null;
	} catch (error) {
		console.error("Error getting latest fuchsen bill period:", error);
		return null;
	}
}

export async function getAllFuchsenBillPeriods() {
	try {
		return await db
			.select()
			.from(fuchsenBillPeriods)
			.orderBy(desc(fuchsenBillPeriods.createdAt));
	} catch (error) {
		console.error("Error getting fuchsen bill periods:", error);
		return [];
	}
}

export async function getFuchsenBillsForPeriod(
	billPeriodId: string,
): Promise<FuchsenBillingEntry[]> {
	try {
		const billsData = await db
			.select()
			.from(fuchsenBills)
			.where(eq(fuchsenBills.billPeriodId, billPeriodId))
			.orderBy(fuchsenBills.userName);

		return await Promise.all(
			billsData.map(async (bill) => {
				const items = await db
					.select()
					.from(fuchsenBillItems)
					.where(eq(fuchsenBillItems.billId, bill.id));
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
			}),
		);
	} catch (error) {
		console.error("Error getting fuchsen bills for period:", error);
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
		console.error("Error grouping unbilled fuchsen orders:", error);
		return [];
	}
}

export async function closeFuchsenBillPeriod(billPeriodId: string) {
	const authCheck = await requireFuchsenwart();
	if (!authCheck.ok) {
		return { success: false, message: authCheck.error };
	}
	try {
		const now = new Date();
		await db
			.update(fuchsenBillPeriods)
			.set({ closedAt: now, updatedAt: now })
			.where(eq(fuchsenBillPeriods.id, billPeriodId));
		return { success: true, message: "Abrechnungsperiode abgeschlossen" };
	} catch (error) {
		console.error("Error closing fuchsen bill period:", error);
		return { success: false, message: "Fehler beim Abschließen" };
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
		// A carried bill is settled through the bill it was rolled into.
		if (bill.status === "Übertragen") {
			return {
				success: false,
				error:
					"Diese Rechnung wurde in eine spätere Rechnung übertragen und wird dort bezahlt",
			};
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
		console.error("Error updating fuchsen bill status:", error);
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

export async function getFuchsenBillingStatistics() {
	try {
		const [unbilled] = await db
			.select({
				count: sql<number>`count(*)`,
				total: sql<number>`coalesce(sum(${fuchsenOrders.total}), 0)`,
			})
			.from(fuchsenOrders)
			.where(isBillable());

		const [periods] = await db
			.select({ count: sql<number>`count(*)` })
			.from(fuchsenBillPeriods);

		const [pending] = await db
			.select({ total: sql<number>`coalesce(sum(${fuchsenBills.total}), 0)` })
			.from(fuchsenBills)
			.where(eq(fuchsenBills.status, "Unbezahlt"));

		return {
			unbilledOrders: {
				count: unbilled?.count ?? 0,
				totalAmount: unbilled?.total ?? 0,
			},
			totalBillPeriods: periods?.count ?? 0,
			pendingBillsAmount: pending?.total ?? 0,
		};
	} catch (error) {
		console.error("Error getting fuchsen billing statistics:", error);
		return null;
	}
}

/** The current user's own fuchsen bills (newest first), with line items. */
export async function getMyFuchsenBills(): Promise<
	{ period: FuchsenBillPeriod | null; bill: FuchsenBillingEntry }[]
> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return [];
		}

		const rows = await db
			.select({ bill: fuchsenBills, period: fuchsenBillPeriods })
			.from(fuchsenBills)
			.leftJoin(
				fuchsenBillPeriods,
				eq(fuchsenBills.billPeriodId, fuchsenBillPeriods.id),
			)
			.where(eq(fuchsenBills.userId, session.user.id))
			.orderBy(desc(fuchsenBills.createdAt));

		return await Promise.all(
			rows.map(async ({ bill, period }) => {
				const items = await db
					.select()
					.from(fuchsenBillItems)
					.where(eq(fuchsenBillItems.billId, bill.id));
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
			}),
		);
	} catch (error) {
		console.error("Error getting my fuchsen bills:", error);
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
			["Name", "Status", "Artikel", "Alter Saldo", "Gesamt"].join(";"),
			...billsData.map((b) =>
				[
					b.userName,
					b.status,
					fmt(b.itemsTotal),
					fmt(b.oldBillingAmount),
					fmt(b.total),
				].join(";"),
			),
			["Gesamt", "", "", "", fmt(period.totalAmount)].join(";"),
		];

		return {
			success: true,
			csvContent: `﻿${lines.join("\r\n")}`,
			fileName: `Fuchsenrechnung_${period.billNumber}.csv`,
		};
	} catch (error) {
		console.error("Error generating fuchsen CSV:", error);
		return { success: false, error: "Fehler beim Erstellen der CSV" };
	}
}
