// orders.ts
"use server";

import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import {
	isBookingAccount,
	isValidOrderAmount,
	MAX_ORDER_AMOUNT,
} from "~/lib/drink-order";
import { MY_ORDERS_PAGE_SIZE } from "~/lib/my-orders";
import { orderTotal, unitPriceFor } from "~/lib/pricing";
import { drinks, orders, users } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";
import { requireMember } from "~/server/lib/authz";
import { ActionError, defineAction } from "~/server/lib/define-action";
import { NotFoundError } from "~/server/lib/domain-error";
import { drinkPricing } from "~/server/modules/getraenkekasse/service";
import { checkAndUnlockAchievements } from "./achievements/tracking";

const INVALID_AMOUNT = `Bitte eine ganze Anzahl zwischen 1 und ${MAX_ORDER_AMOUNT} wählen`;

const createOrderSchema = z.object({
	drinkId: z.string(),
	// Display values from the menu (name, price, total) are accepted but
	// never trusted: the server recomputes them from the drinks table.
	drinkName: z.string().optional(),
	pricePerUnit: z.number().optional(),
	total: z.number().optional(),
	amount: z.number({ error: INVALID_AMOUNT }),
	bookingFor: z.string().nullable(),
	targetUserId: z.string().optional(),
	targetUserName: z.string().optional(),
});

/** Books a drink for the caller, or (Admin) for another member. */
export const createOrder = defineAction(
	{
		schema: z.tuple([createOrderSchema]),
		revalidate: ["/leaderboard", "/rechnung"],
		errorMessage:
			"Die Bestellung konnte nicht gebucht werden. Bitte versuche es erneut.",
	},
	async ([orderData], { tenant, user }) => {
		const { db } = tenant;
		const adminId = user.id;

		const [caller] = await db
			.select({ name: users.name })
			.from(users)
			.where(eq(users.id, adminId))
			.limit(1);
		const adminName = caller?.name;
		if (!adminName) {
			throw new ActionError("Dein Name konnte nicht ermittelt werden");
		}

		// Faxe orders always go on the AHV account.
		const bookingFor = user.roles.includes("Faxe")
			? "AHV"
			: orderData.bookingFor;

		// Admin booking: only admins may book for somebody else.
		const isBookingForOther =
			!!orderData.targetUserId && orderData.targetUserId !== adminId;
		if (isBookingForOther) {
			if (!user.roles.includes("Admin")) {
				throw new ActionError(
					"Nur Admins dürfen für andere Mitglieder buchen",
					"FORBIDDEN",
				);
			}
			if (!orderData.targetUserName) {
				throw new ActionError("Für wen gebucht wird, fehlt", "INVALID_INPUT");
			}
		}
		const userId = isBookingForOther
			? (orderData.targetUserId ?? adminId)
			: adminId;
		const userName = isBookingForOther
			? (orderData.targetUserName ?? adminName)
			: adminName;
		const bookedByAdminId = isBookingForOther ? adminId : null;
		const bookedByAdminName = isBookingForOther ? adminName : null;

		if (!isValidOrderAmount(orderData.amount)) {
			throw new ActionError(INVALID_AMOUNT, "INVALID_INPUT");
		}
		if (bookingFor !== null && !isBookingAccount(bookingFor)) {
			throw new ActionError("Unbekanntes Abrechnungskonto", "INVALID_INPUT");
		}

		// The server decides the price: purchase price from the drinks table,
		// plus the tenant's markup on personal orders when that feature is on.
		// Client-sent prices are ignored, so a stale menu can't book an old one.
		const [drink] = await db
			.select({ id: drinks.id, name: drinks.name, price: drinks.price })
			.from(drinks)
			.where(eq(drinks.id, orderData.drinkId))
			.limit(1);
		if (!drink) {
			throw new NotFoundError("Getränk nicht gefunden");
		}

		const pricing = await drinkPricing(tenant);
		const pricePerUnit = unitPriceFor(
			drink.price,
			pricing.markupPercent,
			bookingFor,
		);
		const total = orderTotal(
			pricePerUnit,
			orderData.amount,
			pricing.markupPercent,
		);

		const [newOrder] = await db
			.insert(orders)
			.values({
				userId,
				userName,
				drinkId: drink.id,
				drinkName: drink.name,
				amount: orderData.amount,
				pricePerUnit,
				costPerUnit: pricing.enabled ? drink.price : null,
				total,
				bookingFor,
				bookedByAdminId,
				bookedByAdminName,
			})
			.returning({ id: orders.id });

		// Achievements run after the response, against this Corps explicitly.
		const achievementContext = {
			drinkName: drink.name,
			drinkId: drink.id,
			amount: orderData.amount,
			total,
			bookingFor,
		};
		after(() =>
			checkAndUnlockAchievements(userId, "order_created", achievementContext, {
				tenantId: tenant.tenantId,
			}),
		);

		return { orderId: newOrder?.id };
	},
);

const ordersPageSchema = z.object({
	page: z.number().int().min(1).max(100_000).default(1),
	outOfBillOnly: z.boolean().default(false),
	/** Instants (ISO), so the browser decides where its day starts and ends. */
	from: z.iso.datetime().nullish(),
	to: z.iso.datetime().nullish(),
});

export type MyOrdersQuery = z.input<typeof ordersPageSchema>;

export type MyOrder = {
	id: string;
	createdAt: Date;
	drinkName: string;
	amount: number;
	total: number;
	inBill: boolean;
};

export type MyOrdersPage = {
	orders: MyOrder[];
	/** Orders matching the filters, across all pages. */
	total: number;
	page: number;
	pageSize: number;
};

/**
 * One page of the caller's own orders, newest first, for the profile (#24).
 * The page and the matching count travel in one round trip; the list is
 * never loaded whole.
 */
export async function getMyOrdersPage(
	query: MyOrdersQuery = {},
): Promise<MyOrdersPage> {
	const member = await requireMember();
	const { page, outOfBillOnly, from, to } = ordersPageSchema.parse(query);
	const pageSize = MY_ORDERS_PAGE_SIZE;
	const db = await getCurrentTenantDb();

	const where = and(
		eq(orders.userId, member.id),
		outOfBillOnly ? eq(orders.inBill, false) : undefined,
		from ? gte(orders.createdAt, new Date(from)) : undefined,
		to ? lte(orders.createdAt, new Date(to)) : undefined,
	);
	const [rows, [counted]] = await db.batch([
		db
			.select({
				id: orders.id,
				createdAt: orders.createdAt,
				drinkName: orders.drinkName,
				amount: orders.amount,
				total: orders.total,
				inBill: orders.inBill,
			})
			.from(orders)
			.where(where)
			.orderBy(desc(orders.createdAt), desc(sql`${orders}.rowid`))
			.limit(pageSize)
			.offset((page - 1) * pageSize),
		db.select({ total: count() }).from(orders).where(where),
	]);

	return { orders: rows, total: counted?.total ?? 0, page, pageSize };
}
