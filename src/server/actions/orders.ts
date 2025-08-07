"use server";

import { db } from "~/server/db";
import { orders } from "~/server/db/schema";
// TODO: Replace with actual auth system when implemented
// import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export interface CreateOrderRequest {
  drinkId: string;
  drinkName: string;
  amount: number;
  pricePerUnit: number;
  total: number;
}

export interface OrderResult {
  success: boolean;
  error?: string;
  orderId?: string;
}

export async function createOrder(
  orderData: CreateOrderRequest
): Promise<OrderResult> {
  try {
    // TODO: Get authenticated user when auth is implemented
    // const { userId } = await auth();
    // if (!userId) {
    //   return {
    //     success: false,
    //     error: "User must be authenticated to place an order"
    //   };
    // }

    // For now, default to "Huibers" user
    const userId = "huibers-default-id";
    const userName = "Huibers";

    // Validate order data
    if (orderData.amount <= 0) {
      return {
        success: false,
        error: "Order amount must be greater than 0",
      };
    }

    if (orderData.total !== orderData.pricePerUnit * orderData.amount) {
      return {
        success: false,
        error: "Total price calculation is incorrect",
      };
    }

    // Create the order
    const [newOrder] = await db
      .insert(orders)
      .values({
        userId,
        userName,
        drinkId: orderData.drinkId,
        drinkName: orderData.drinkName,
        amount: orderData.amount,
        pricePerUnit: orderData.pricePerUnit,
        total: orderData.total,
      })
      .returning();

    // Revalidate relevant paths
    revalidatePath("/orders");
    revalidatePath("/drinks");

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

export async function getUserOrders(userId?: string) {
  try {
    // TODO: Get authenticated user when auth is implemented
    // const { userId: authUserId } = await auth();
    // const targetUserId = userId || authUserId;
    // if (!targetUserId) {
    //   throw new Error("User ID required");
    // }

    // For now, default to "Huibers" user
    const targetUserId = userId || "huibers-default-id";

    const userOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, targetUserId))
      .orderBy(orders.createdAt);

    return userOrders;
  } catch (error) {
    console.error("Error fetching user orders:", error);
    throw error;
  }
}

export async function updateOrderStatus(orderId: string) {
  try {
    // TODO: Get authenticated user when auth is implemented
    // const { userId } = await auth();
    // if (!userId) {
    //   throw new Error("User must be authenticated");
    // }

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
