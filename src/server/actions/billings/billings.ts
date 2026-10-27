"use server";

import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { billItems, billPeriods, bills, orders } from "~/server/db/schema";
import { ROLES, requireMember, requireRole } from "~/server/lib/authz";
import { runGetraenkeBilling } from "~/server/lib/billing-run";
import { carriedBillRefusal, paidAlongWith } from "~/server/lib/carried-bills";
import { groupBy } from "~/server/lib/group-by";
import { log } from "~/server/lib/log";

/**
 * The Kasse's "Neue Rechnung": bills every unbilled order and carries open
 * bills over. It charges no Umlage. Server actions can be called with any
 * arguments, so this one takes none: the inventory-loss Umlage is only
 * billed by "Inventur + Rechnung", from the loss stored on the server (#10).
 */
export async function createNewBilling() {
	await requireRole(ROLES.getraenke);
	return runGetraenkeBilling({ inventoryLoss: 0 });
}

// Get the latest bill period
export async function getLatestBillPeriod() {
	await requireMember();
	try {
		const [latestPeriod] = await db
			.select()
			.from(billPeriods)
			.orderBy(desc(billPeriods.createdAt))
			.limit(1);

		return latestPeriod || null;
	} catch (error) {
		await log.error("Error getting latest bill period", { err: error });
		return null;
	}
}

// Get all bill periods (for displaying tabs)
export async function getAllBillPeriods() {
	await requireMember();
	try {
		const periods = await db
			.select()
			.from(billPeriods)
			.orderBy(desc(billPeriods.createdAt));

		return periods;
	} catch (error) {
		await log.error("Error getting bill periods", { err: error });
		return [];
	}
}

// Get bills for a specific period
export async function getBillsForPeriod(billPeriodId: string) {
	await requireMember();
	try {
		// Bills and all their items in one round trip.
		const [billsData, itemRows] = await db.batch([
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
		const itemsByBill = groupBy(
			itemRows.map((r) => r.item),
			(item) => item.billId,
		);

		const billsWithItems = billsData.map((bill) => {
			const items = itemsByBill.get(bill.id) ?? [];

			return {
				id: bill.id,
				name: bill.userName,
				totalDue: bill.total,
				status: bill.status,
				oldBillingAmount: bill.oldBillingAmount,
				drinksTotal: bill.drinksTotal,
				fees: bill.fees,
				umlage: bill.umlage,
				items: items.map((item) => ({
					id: item.id,
					name: item.drinkName,
					quantity: item.amount,
					unitPrice: item.pricePerDrink,
					subtotal: item.totalPricePerDrink,
				})),
			};
		});

		return billsWithItems;
	} catch (error) {
		await log.error("Error getting bills for period", { err: error });
		return [];
	}
}

// Close/finalize a billing period
export async function closeBillPeriod(billPeriodId: string) {
	await requireRole(ROLES.getraenke);
	try {
		const now = new Date();

		await db
			.update(billPeriods)
			.set({
				closedAt: now,
				updatedAt: now,
			})
			.where(eq(billPeriods.id, billPeriodId));

		return {
			success: true,
			message: "Abrechnungsperiode erfolgreich abgeschlossen",
		};
	} catch (error) {
		await log.error("Error closing bill period", { err: error });
		return {
			success: false,
			message: "Fehler beim Abschließen der Abrechnungsperiode",
		};
	}
}

/**
 * Sets a bill's status from the Kasse. "Übertragen" is set by billing runs
 * only. Carried bills and bills paid through the later bill they were
 * carried into change only through that later bill (see carried-bills).
 */
export async function updateBillStatus(
	billId: string,
	newStatus: "Bezahlt" | "Unbezahlt" | "Gestundet" | "Übertragen",
): Promise<{ success: true } | { success: false; error?: string }> {
	await requireRole(ROLES.getraenke);
	if (
		newStatus !== "Bezahlt" &&
		newStatus !== "Unbezahlt" &&
		newStatus !== "Gestundet"
	) {
		return { success: false, error: "Ungültiger Status" };
	}
	try {
		const [bill] = await db
			.select()
			.from(bills)
			.where(eq(bills.id, billId))
			.limit(1);
		if (!bill) {
			return { success: false, error: "Rechnung nicht gefunden" };
		}
		// Gruppenrechnungen are settled directly and never carried.
		const carries = !bill.userId.startsWith("event-");
		const refusal = carries ? await carriedBillRefusal(bills, bill) : null;
		if (refusal) {
			return { success: false, error: refusal };
		}
		// Paying a paid bill again would move its paidAt away from the bills
		// it settled, and with it the link to them.
		if (bill.status === newStatus) {
			return { success: true };
		}

		const now = new Date();
		const setStatus = db
			.update(bills)
			.set({
				status: newStatus,
				paidAt: newStatus === "Bezahlt" ? now : null,
				updatedAt: now,
			})
			.where(eq(bills.id, billId));

		if (newStatus === "Bezahlt" && carries) {
			// The carried ("Übertragen") bills of the member were rolled into
			// this bill's Übertrag, so paying it pays them too.
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
		} else if (bill.status === "Bezahlt" && bill.paidAt && carries) {
			// Undoing a payment reopens the bills it settled, as carried.
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

		return { success: true };
	} catch (error) {
		await log.error("Error updating bill status", { err: error });
		return { success: false, error: "Fehler beim Aktualisieren des Status" };
	}
}

// Get billing statistics (updated to include detailed event breakdown)
export async function getBillingStatistics() {
	await requireRole(ROLES.getraenke);
	try {
		const [unbilledCount] = await db
			.select({ count: sql<number>`count(*)` })
			.from(orders)
			.where(
				and(
					eq(orders.inBill, false),
					isNull(orders.bookingFor), // Only count personal orders
				),
			);

		const [unbilledTotal] = await db
			.select({ total: sql<number>`coalesce(sum(${orders.total}), 0)` })
			.from(orders)
			.where(
				and(
					eq(orders.inBill, false),
					isNull(orders.bookingFor), // Only sum personal orders
				),
			);

		// Get detailed event orders grouped by event name
		const eventOrdersGrouped = await db
			.select({
				eventName: orders.bookingFor,
				count: sql<number>`count(*)`,
				totalAmount: sql<number>`sum(${orders.total})`,
				bookedBy: sql<string>`GROUP_CONCAT(DISTINCT ${orders.userName})`,
			})
			.from(orders)
			.where(
				and(eq(orders.inBill, false), sql`${orders.bookingFor} IS NOT NULL`),
			)
			.groupBy(orders.bookingFor);

		// Calculate totals for all event orders
		const eventOrdersTotals = eventOrdersGrouped.reduce(
			(acc, event) => ({
				count: acc.count + Number(event.count),
				totalAmount: acc.totalAmount + Number(event.totalAmount),
			}),
			{ count: 0, totalAmount: 0 },
		);

		const [totalPeriods] = await db
			.select({ count: sql<number>`count(*)` })
			.from(billPeriods);

		const [pendingBillsTotal] = await db
			.select({ total: sql<number>`coalesce(sum(${bills.total}), 0)` })
			.from(bills)
			.where(eq(bills.status, "Unbezahlt"));

		return {
			unbilledOrders: {
				count: unbilledCount?.count ?? 0,
				totalAmount: unbilledTotal?.total ?? 0,
			},
			eventOrders: {
				count: eventOrdersTotals.count,
				totalAmount: eventOrdersTotals.totalAmount,
				events: eventOrdersGrouped.map((event) => ({
					name: event.eventName || "Unknown Event",
					orderCount: Number(event.count),
					totalAmount: Number(event.totalAmount),
					bookedBy: event.bookedBy?.split(",") || [],
				})),
			},
			totalBillPeriods: totalPeriods?.count ?? 0,
			pendingBillsAmount: pendingBillsTotal?.total ?? 0,
		};
	} catch (error) {
		await log.error("Error getting billing statistics", { err: error });
		return null;
	}
}

// Get event orders (orders with bookingFor set) - useful for tracking
export async function getEventOrders() {
	await requireRole(ROLES.getraenke);
	try {
		const eventOrders = await db
			.select()
			.from(orders)
			.where(sql`${orders.bookingFor} IS NOT NULL`)
			.orderBy(desc(orders.createdAt));

		return eventOrders;
	} catch (error) {
		await log.error("Error getting event orders", { err: error });
		return [];
	}
}
