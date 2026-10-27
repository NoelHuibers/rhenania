// currentOrders.ts
"use server";

import { eq, sql } from "drizzle-orm";
import { addMoney } from "~/lib/money";
import { orders } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";
import { requireMember } from "~/server/lib/authz";
import { log } from "~/server/lib/log";

// Entries and their items follow the order the orders were placed in, and
// an event's `bookedBy` is whoever booked first. Without an ORDER BY, rows
// come back in whatever order the index SQLite picks yields.
const inOrderPlaced = [orders.createdAt, sql`${orders}.rowid`] as const;

interface DrinkItem {
	id: string;
	name: string;
	quantity: number;
	unitPrice: number;
	subtotal: number;
}

interface BillingEntry {
	id: string;
	name: string;
	totalDue: number;
	items: DrinkItem[];
}

export async function getCurrentOrders(): Promise<BillingEntry[]> {
	await requireMember();
	try {
		const db = await getCurrentTenantDb();
		// Fetch all orders where inBill is false (both personal and event orders)
		const allCurrentOrders = await db
			.select()
			.from(orders)
			.where(eq(orders.inBill, false))
			.orderBy(...inOrderPlaced);

		// Separate personal and event orders
		const personalOrders = allCurrentOrders.filter(
			(order) => !order.bookingFor,
		);
		const eventOrders = allCurrentOrders.filter((order) => order.bookingFor);

		// Group personal orders by userId and userName
		const groupedOrders = personalOrders.reduce(
			(acc, order) => {
				const key = `${order.userId}`;

				if (!acc[key]) {
					acc[key] = {
						id: order.userId,
						name: order.userName,
						totalDue: 0,
						items: [],
					};
				}

				// Check if this drink already exists in the user's items
				const existingItem = acc[key].items.find(
					(item) =>
						item.name === order.drinkName &&
						item.unitPrice === order.pricePerUnit,
				);

				if (existingItem) {
					// If drink exists with same price, add to quantity and update subtotal
					existingItem.quantity += order.amount;
					existingItem.subtotal = addMoney(existingItem.subtotal, order.total);
				} else {
					// If new drink or different price, create new item
					acc[key].items.push({
						id: order.id,
						name: order.drinkName,
						quantity: order.amount,
						unitPrice: order.pricePerUnit,
						subtotal: order.total,
					});
				}

				acc[key].totalDue = addMoney(acc[key].totalDue, order.total);
				return acc;
			},
			{} as Record<string, BillingEntry>,
		);

		// Group event orders by event name only (bookingFor field)
		const groupedEventOrders = eventOrders.reduce(
			(acc, order) => {
				const eventName = order.bookingFor || "Unknown Event";
				const key = `event-${eventName}`;

				if (!acc[key]) {
					acc[key] = {
						id: `event-${eventName}`,
						name: `${eventName}`,
						totalDue: 0,
						items: [],
					};
				}

				// Check if this drink already exists in the event's items
				const existingItem = acc[key].items.find(
					(item) =>
						item.name === order.drinkName &&
						item.unitPrice === order.pricePerUnit,
				);

				if (existingItem) {
					// If drink exists with same price, add to quantity and update subtotal
					existingItem.quantity += order.amount;
					existingItem.subtotal = addMoney(existingItem.subtotal, order.total);
				} else {
					// If new drink or different price, create new item
					acc[key].items.push({
						id: order.id,
						name: order.drinkName,
						quantity: order.amount,
						unitPrice: order.pricePerUnit,
						subtotal: order.total,
					});
				}

				acc[key].totalDue = addMoney(acc[key].totalDue, order.total);
				return acc;
			},
			{} as Record<string, BillingEntry>,
		);

		// Combine both personal and event orders
		const allGroupedOrders = { ...groupedOrders, ...groupedEventOrders };

		return Object.values(allGroupedOrders);
	} catch (error) {
		await log.error("Error fetching current orders", { err: error });
		throw new Error("Failed to fetch current orders");
	}
}
