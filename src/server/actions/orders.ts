// orders.ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth"; // Import your NextAuth auth function
import { db } from "~/server/db";
import { orders } from "~/server/db/schema";
import { getUserName } from "./getUserName";
import { getUserRole } from "./getUserRole";

export interface CreateOrderRequest {
  drinkId: string;
  drinkName: string;
  amount: number;
  pricePerUnit: number;
  total: number;
  bookingFor: string | null;
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
    const session = await auth();

    if (!session?.user?.id) {
      return {
        success: false,
        error: "User must be authenticated to place an order",
      };
    }

    const userId = session.user.id;
    const userName = await getUserName();
    const role = await getUserRole(userId);

    if (role.role?.name === "Faxe") {
      orderData.bookingFor = "AHV";
    }

    if (!userName || typeof userName !== "string") {
      return {
        success: false,
        error: "Failed to retrieve user name",
      };
    }

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
        bookingFor: orderData.bookingFor,
      })
      .returning();

    revalidatePath("/leaderboard");
    revalidatePath("/rechnung");

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
