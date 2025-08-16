"use server";
import { revalidatePath } from "next/cache";
import { db } from "../db";
import { orders } from "../db/schema";
import type { CreateOrderRequest, OrderResult } from "./orders";

export async function createPartyOrder(
  orderData: CreateOrderRequest
): Promise<OrderResult> {
  try {
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
        userId: "party",
        userName: "Abt's Party",
        drinkId: orderData.drinkId,
        drinkName: orderData.drinkName,
        amount: orderData.amount,
        pricePerUnit: orderData.pricePerUnit,
        total: orderData.total,
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
