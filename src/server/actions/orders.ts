// orders.ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { orderTotal, unitPriceFor } from "~/lib/pricing";
import { auth } from "~/server/auth";
import { drinks, orders } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";
import { getDrinkPricingConfig } from "~/server/lib/getraenke-settings";
import { requireTenantId } from "~/server/lib/tenant-context";
import { checkAndUnlockAchievements } from "./achievements/tracking";
import { hasRole } from "./admin/userRoles";
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

		const [isFaxe, isAdmin] = await Promise.all([
			hasRole(adminId, "Faxe"),
			hasRole(adminId, "Admin"),
		]);

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

		if (orderData.amount <= 0) {
			return {
				success: false,
				error: "Order amount must be greater than 0",
			};
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
		console.error("Error creating order:", error);
		return {
			success: false,
			error: "Failed to create order. Please try again.",
		};
	}
}

export async function getUserOrders() {
	try {
		const db = await getCurrentTenantDb();
		const session = await auth();

		if (!session?.user?.id) {
			throw new Error("User must be authenticated to view orders");
		}

		const userOrders = await db
			.select()
			.from(orders)
			.where(eq(orders.userId, session.user.id))
			.orderBy(orders.createdAt);

		return userOrders;
	} catch (error) {
		console.error("Error fetching user orders:", error);
		throw error;
	}
}

export async function updateOrderStatus(orderId: string) {
	try {
		const db = await getCurrentTenantDb();
		const session = await auth();

		if (!session?.user?.id) {
			throw new Error("User must be authenticated to update orders");
		}

		const existingOrder = await db
			.select()
			.from(orders)
			.where(eq(orders.id, orderId))
			.limit(1);

		if (!existingOrder.length) {
			throw new Error("Order not found");
		}

		await db
			.update(orders)
			.set({
				updatedAt: new Date(),
			})
			.where(eq(orders.id, orderId));

		revalidatePath("/orders");
		return { success: true };
	} catch (error) {
		console.error("Error updating order:", error);
		throw error;
	}
}
