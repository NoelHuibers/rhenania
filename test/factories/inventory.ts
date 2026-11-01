// Factories for the drinks / orders / Inventur domain. They write straight
// into the current tenant DB so tests can set up history (past orders,
// closed inventories) that the server actions would only create "now".

import {
	etaplans,
	events,
	inventories,
	inventoryItems,
	kostenpunkte,
	orders,
} from "~/server/db/schema";
import { requireTenant, testState } from "../state";

type DrinkRef = { id: string; name: string; price: number };
type UserRef = { id: string; name: string | null };

/** Whole-second Date `days` before `from` (SQLite timestamps are seconds). */
export function daysAgo(days: number, from = Date.now()): Date {
	return new Date(Math.floor((from - days * 86_400_000) / 1000) * 1000);
}

/** Inserts an order row as `createOrder` would have stored it. */
export async function createOrderRow(
	opts: {
		drink: DrinkRef;
		user?: UserRef;
		amount?: number;
		pricePerUnit?: number;
		total?: number;
		costPerUnit?: number | null;
		bookingFor?: string | null;
		inBill?: boolean;
		createdAt?: Date;
		bookedByAdminName?: string | null;
	},
	tenantId = testState.tenantId,
) {
	const amount = opts.amount ?? 1;
	const pricePerUnit = opts.pricePerUnit ?? opts.drink.price;
	const [order] = await requireTenant(tenantId)
		.db.insert(orders)
		.values({
			userId: opts.user?.id ?? "user-without-account",
			userName: opts.user?.name ?? "Unbekannt",
			drinkId: opts.drink.id,
			drinkName: opts.drink.name,
			amount,
			pricePerUnit,
			costPerUnit: opts.costPerUnit ?? null,
			total: opts.total ?? pricePerUnit * amount,
			bookingFor: opts.bookingFor ?? null,
			inBill: opts.inBill ?? false,
			bookedByAdminName: opts.bookedByAdminName ?? null,
			...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
		})
		.returning();
	if (!order) {
		throw new Error("Could not create order");
	}
	return order;
}

export type InventoryItemSeed = {
	drink: DrinkRef;
	countedStock: number;
	/** A real count; defaults to closed inventories only, as the app writes it. */
	isCounted?: boolean;
	previousStock?: number;
	purchasedSince?: number;
	soldSince?: number;
	lossValue?: number;
};

/** Inserts an inventory (active or closed) with its items. */
export async function createInventory(
	opts: {
		status?: "active" | "closed";
		kind?: "routine" | "event";
		createdAt?: Date;
		closedAt?: Date | null;
		totalLoss?: number;
		performedBy?: string | null;
		eventId?: string | null;
		eventName?: string | null;
		eventDate?: Date | null;
		items?: InventoryItemSeed[];
	} = {},
	tenantId = testState.tenantId,
) {
	const db = requireTenant(tenantId).db;
	const [inventory] = await db
		.insert(inventories)
		.values({
			status: opts.status ?? "active",
			kind: opts.kind ?? "routine",
			totalLoss: opts.totalLoss ?? 0,
			performedBy: opts.performedBy ?? null,
			closedAt: opts.closedAt ?? null,
			eventId: opts.eventId ?? null,
			eventName: opts.eventName ?? null,
			eventDate: opts.eventDate ?? null,
			...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
		})
		.returning();
	if (!inventory) {
		throw new Error("Could not create inventory");
	}

	for (const item of opts.items ?? []) {
		await db.insert(inventoryItems).values({
			inventoryId: inventory.id,
			drinkId: item.drink.id,
			countedStock: item.countedStock,
			isCounted: item.isCounted ?? inventory.status === "closed",
			previousStock: item.previousStock ?? item.countedStock,
			purchasedSince: item.purchasedSince ?? 0,
			soldSince: item.soldSince ?? 0,
			priceAtCount: item.drink.price,
			lossValue: item.lossValue ?? 0,
		});
	}
	return inventory;
}

export async function createEvent(
	opts: { title?: string; date: Date },
	tenantId = testState.tenantId,
) {
	const [event] = await requireTenant(tenantId)
		.db.insert(events)
		.values({ title: opts.title ?? "Kneipe", date: opts.date })
		.returning();
	if (!event) {
		throw new Error("Could not create event");
	}
	return event;
}

/** An Etaplan (semester budget) with the given Kostenpunkte. */
export async function createEtaplan(
	opts: {
		name?: string;
		createdAt?: Date;
		kostenpunkte?: Array<{ name: string; category?: string }>;
	} = {},
	tenantId = testState.tenantId,
) {
	const db = requireTenant(tenantId).db;
	const [plan] = await db
		.insert(etaplans)
		.values({
			name: opts.name ?? "WS 2026/27",
			semesterType: "WS",
			year: 2026,
			...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
		})
		.returning();
	if (!plan) {
		throw new Error("Could not create Etaplan");
	}

	const kps: (typeof kostenpunkte.$inferSelect)[] = [];
	for (const kp of opts.kostenpunkte ?? []) {
		const [row] = await db
			.insert(kostenpunkte)
			.values({
				etaplanId: plan.id,
				name: kp.name,
				category: kp.category ?? "Veranstaltungen",
			})
			.returning();
		if (!row) {
			throw new Error("Could not create Kostenpunkt");
		}
		kps.push(row);
	}
	return { plan, kostenpunkte: kps };
}
