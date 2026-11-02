"use server";

// actions.ts — booking drinks, a member's own orders and the unbilled
// orders (#33). Check the caller and the input, then one call to the orders
// service. `createOrder` answers with an ActionResult; the reads keep their
// old answers: a failed read of the unbilled orders is logged and thrown as
// "Failed to fetch current orders".

import { z } from "zod";
import type { BillingEntry } from "~/server/domain/orders/open-orders";
import { requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { log } from "~/server/lib/log";
import { scopeOf } from "~/server/lib/tenant-scope";
import * as orders from "./service";

export type { MyOrder, MyOrdersPage, MyOrdersQuery } from "./service";

/** Books a drink for the caller, or (Admin) for another member. */
export const createOrder = defineAction(
	{
		schema: z.tuple([orders.createOrderSchema]),
		revalidate: ["/leaderboard", "/rechnung"],
		errorMessage:
			"Die Bestellung konnte nicht gebucht werden. Bitte versuche es erneut.",
	},
	async ([orderData], { tenant, user }) =>
		orders.createOrder(tenant, user, orderData),
);

/**
 * One page of the caller's own orders, newest first, for the profile (#24).
 * The page and the matching count travel in one round trip; the list is
 * never loaded whole.
 */
export async function getMyOrdersPage(
	query: orders.MyOrdersQuery = {},
): Promise<orders.MyOrdersPage> {
	const { member, tenantId } = await requireCaller();
	const parsed = orders.ordersPageSchema.parse(query);
	return orders.myOrdersPage(await scopeOf(tenantId), member.id, parsed);
}

/** The unbilled orders per member and booking account (/rechnungen). */
export async function getCurrentOrders(): Promise<BillingEntry[]> {
	const { tenantId } = await requireCaller();
	try {
		return await orders.openOrders(await scopeOf(tenantId));
	} catch (error) {
		await log.error("Error fetching current orders", { err: error });
		throw new Error("Failed to fetch current orders");
	}
}
