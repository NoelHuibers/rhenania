"use server";

import { eq } from "drizzle-orm";
import { db } from "~/server/db"; // Adjust import path based on your setup
import { orders } from "~/server/db/schema";

// Types matching your component
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
  try {
    // Fetch all orders where inBill is false
    const currentOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.inBill, false));

    // Group orders by userId and userName
    const groupedOrders = currentOrders.reduce((acc, order) => {
      const key = `${order.userId}-${order.userName}`;

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
        (item) => item.name === order.drinkName
      );

      if (existingItem) {
        // If drink exists, add to quantity and update subtotal
        existingItem.quantity += order.amount;
        existingItem.subtotal += order.total;
      } else {
        // If new drink, create new item
        acc[key].items.push({
          id: order.id,
          name: order.drinkName,
          quantity: order.amount,
          unitPrice: order.pricePerUnit,
          subtotal: order.total,
        });
      }

      acc[key].totalDue += order.total;

      return acc;
    }, {} as Record<string, BillingEntry>);
    return Object.values(groupedOrders);
  } catch (error) {
    console.error("Error fetching current orders:", error);
    throw new Error("Failed to fetch current orders");
  }
}
