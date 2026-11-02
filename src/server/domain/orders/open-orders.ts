// open-orders.ts — the unbilled orders, grouped for the Rechnungen page.
//
// Pure: personal orders grouped by member, event orders by the account they
// were booked on, each with one line per drink and price. The orders come
// in the order they were placed, so the lines and an event's first booker
// follow that order.

import { addMoney } from "~/lib/money";

type Order = {
	id: string;
	userId: string;
	userName: string;
	drinkName: string;
	amount: number;
	pricePerUnit: number;
	total: number;
	bookingFor: string | null;
};

export interface DrinkItem {
	id: string;
	name: string;
	quantity: number;
	unitPrice: number;
	subtotal: number;
}

export interface BillingEntry {
	id: string;
	name: string;
	totalDue: number;
	items: DrinkItem[];
}

/** The unbilled orders grouped per member and per booking account. */
export function groupOpenOrders(allCurrentOrders: Order[]): BillingEntry[] {
	// Separate personal and event orders
	const personalOrders = allCurrentOrders.filter((order) => !order.bookingFor);
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
}
