// orders.ts
"use server";

import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import {
	isBookingAccount,
	isValidOrderAmount,
	MAX_ORDER_AMOUNT,
} from "~/lib/drink-order";
import { MY_ORDERS_PAGE_SIZE } from "~/lib/my-orders";
import { orderTotal, unitPriceFor } from "~/lib/pricing";
import { auth } from "~/server/auth";
import { drinks, orders } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";
import { requireMember } from "~/server/lib/authz";
import { getDrinkPricingConfig } from "~/server/lib/getraenke-settings";
import { log } from "~/server/lib/log";
import { requireTenantId } from "~/server/lib/tenant-context";
import { checkAndUnlockAchievements } from "./achievements/tracking";
import { getUserName } from "./getUserName";

export interface CreateOrderRequest {
	drinkId: string;
	drinkName: string;
	amount: number;
	// Display values from the menu. The server recomputes name, price and
	// total from the drinks table, so these are never trusted.
	pricePerUnit: number;
	total: number;
	bookingFor: string | null;
	targetUserId?: string;
	targetUserName?: string;
}

export interface OrderResult {
	success: boolean;
	error?: string;
	orderId?: string;
}

export async function createOrder(
	orderData: CreateOrderRequest,
): Promise<OrderResult> {
	try {
		const db = await getCurrentTenantDb();
		const session = await auth();

		if (!session?.user?.id) {
			return {
				success: false,
				error: "User must be authenticated to place an order",
			};
		}

		const adminId = session.user.id;
		const adminName = await getUserName();

		const isFaxe = session.user.roles.includes("Faxe");
		const isAdmin = session.user.roles.includes("Admin");

		if (isFaxe) {
			orderData.bookingFor = "AHV";
		}

		if (!adminName || typeof adminName !== "string") {
			return {
				success: false,
				error: "Failed to retrieve user name",
			};
		}

		// Admin booking: validate that the current user is actually an admin
		if (orderData.targetUserId && orderData.targetUserId !== adminId) {
			if (!isAdmin) {
				return {
					success: false,
					error: "Only admins can book orders for other users",
				};
			}
			if (!orderData.targetUserName) {
				return {
					success: false,
					error: "Target user name is required when booking for another user",
				};
			}
		}

		const isBookingForOther =
			!!orderData.targetUserId && orderData.targetUserId !== adminId;
		const userId = isBookingForOther
			? (orderData.targetUserId ?? adminId)
			: adminId;
		const userName = isBookingForOther
			? // targetUserName is validated above when isBookingForOther
				(orderData.targetUserName ?? adminName)
			: adminName;
		const bookedByAdminId = isBookingForOther ? adminId : null;
		const bookedByAdminName = isBookingForOther ? adminName : null;

		if (!isValidOrderAmount(orderData.amount)) {
			return {
				success: false,
				error: `Bitte eine ganze Anzahl zwischen 1 und ${MAX_ORDER_AMOUNT} wählen`,
			};
		}
		if (
			orderData.bookingFor !== null &&
			!isBookingAccount(orderData.bookingFor)
		) {
			return { success: false, error: "Unbekanntes Abrechnungskonto" };
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
			return { success: false, error: "Getränk nicht gefunden" };
		}

		const pricing = await getDrinkPricingConfig();
		const pricePerUnit = unitPriceFor(
			drink.price,
			pricing.markupPercent,
			orderData.bookingFor,
		);
		const total = orderTotal(
			pricePerUnit,
			orderData.amount,
			pricing.markupPercent,
		);

		// Create the order
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
				bookingFor: orderData.bookingFor,
				bookedByAdminId,
				bookedByAdminName,
			})
			.returning();

		revalidatePath("/leaderboard");
		revalidatePath("/rechnung");

		// Achievements run after the response, against this Corps explicitly.
		const tenantId = await requireTenantId();
		const achievementContext = {
			drinkName: drink.name,
			drinkId: drink.id,
			amount: orderData.amount,
			total,
			bookingFor: orderData.bookingFor,
		};
		after(() =>
			checkAndUnlockAchievements(userId, "order_created", achievementContext, {
				tenantId,
			}),
		);

		return {
			success: true,
			orderId: newOrder?.id,
		};
	} catch (error) {
		await log.error("Error creating order", { err: error });
		return {
			success: false,
			error: "Failed to create order. Please try again.",
		};
	}
}

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
