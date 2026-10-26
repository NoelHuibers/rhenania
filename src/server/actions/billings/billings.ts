"use server";

import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { billItems, billPeriods, bills, orders } from "~/server/db/schema";
import { runGetraenkeBilling } from "~/server/lib/billing-run";
import { groupBy } from "~/server/lib/group-by";

/**
 * The Kasse's "Neue Rechnung": bills every unbilled order and carries open
 * bills over. It charges no Umlage. Server actions can be called with any
 * arguments, so this one takes none: the inventory-loss Umlage is only
 * billed by "Inventur + Rechnung", from the loss stored on the server (#10).
 */
export async function createNewBilling() {
	return runGetraenkeBilling({ inventoryLoss: 0 });
}

// Get the latest bill period
export async function getLatestBillPeriod() {
	try {
		const [latestPeriod] = await db
			.select()
			.from(billPeriods)
			.orderBy(desc(billPeriods.createdAt))
			.limit(1);

		return latestPeriod || null;
	} catch (error) {
		console.error("Error getting latest bill period:", error);
		return null;
	}
}

// Get all bill periods (for displaying tabs)
export async function getAllBillPeriods() {
	try {
		const periods = await db
			.select()
			.from(billPeriods)
			.orderBy(desc(billPeriods.createdAt));

		return periods;
	} catch (error) {
		console.error("Error getting bill periods:", error);
		return [];
	}
}

// Get bills for a specific period
export async function getBillsForPeriod(billPeriodId: string) {
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
		console.error("Error getting bills for period:", error);
		return [];
	}
}

// Close/finalize a billing period
export async function closeBillPeriod(billPeriodId: string) {
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
		console.error("Error closing bill period:", error);
		return {
			success: false,
			message: "Fehler beim Abschließen der Abrechnungsperiode",
		};
	}
}

// Update bill status
export async function updateBillStatus(
	billId: string,
	newStatus: "Bezahlt" | "Unbezahlt" | "Gestundet" | "Übertragen",
) {
	try {
		const now = new Date();
		// biome-ignore lint/suspicious/noExplicitAny: dynamic update data with optional paidAt field
		const updateData: any = {
			status: newStatus,
			updatedAt: now,
		};

		// Set paidAt if marking as paid
		if (newStatus === "Bezahlt") {
			updateData.paidAt = now;
		} else {
			updateData.paidAt = null;
		}

		await db.update(bills).set(updateData).where(eq(bills.id, billId));

		// When a consolidated bill is paid, also settle the carried-over
		// ("Übertragen") predecessor bills of the same member — their amount was
		// rolled into this bill's Übertrag, so they are now paid too.
		if (newStatus === "Bezahlt") {
			const [paid] = await db
				.select({ userId: bills.userId, createdAt: bills.createdAt })
				.from(bills)
				.where(eq(bills.id, billId))
				.limit(1);
			if (paid) {
				await db
					.update(bills)
					.set({ status: "Bezahlt", paidAt: now, updatedAt: now })
					.where(
						and(
							eq(bills.userId, paid.userId),
							eq(bills.status, "Übertragen"),
							lt(bills.createdAt, paid.createdAt),
						),
					);
			}
		}

		return { success: true };
	} catch (error) {
		console.error("Error updating bill status:", error);
		return { success: false };
	}
}

// Get billing statistics (updated to include detailed event breakdown)
export async function getBillingStatistics() {
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
		console.error("Error getting billing statistics:", error);
		return null;
	}
}

// Get event orders (orders with bookingFor set) - useful for tracking
export async function getEventOrders() {
	try {
		const eventOrders = await db
			.select()
			.from(orders)
			.where(sql`${orders.bookingFor} IS NOT NULL`)
			.orderBy(desc(orders.createdAt));

		return eventOrders;
	} catch (error) {
		console.error("Error getting event orders:", error);
		return [];
	}
}
