"use server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
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
    // Fetch all orders where inBill is false (both personal and event orders)
    const allCurrentOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.inBill, false));

    // Separate personal and event orders
    const personalOrders = allCurrentOrders.filter(
      (order) => !order.bookingFor
    );
    const eventOrders = allCurrentOrders.filter((order) => order.bookingFor);

    // Group personal orders by userId and userName
    const groupedOrders = personalOrders.reduce((acc, order) => {
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
        (item) =>
          item.name === order.drinkName && item.unitPrice === order.pricePerUnit
      );

      if (existingItem) {
        // If drink exists with same price, add to quantity and update subtotal
        existingItem.quantity += order.amount;
        existingItem.subtotal += order.total;
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

      acc[key].totalDue += order.total;
      return acc;
    }, {} as Record<string, BillingEntry>);

    // Group event orders by event name only (bookingFor field)
    const groupedEventOrders = eventOrders.reduce((acc, order) => {
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
          item.name === order.drinkName && item.unitPrice === order.pricePerUnit
      );

      if (existingItem) {
        // If drink exists with same price, add to quantity and update subtotal
        existingItem.quantity += order.amount;
        existingItem.subtotal += order.total;
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

      acc[key].totalDue += order.total;
      return acc;
    }, {} as Record<string, BillingEntry>);

    // Combine both personal and event orders
    const allGroupedOrders = { ...groupedOrders, ...groupedEventOrders };

    return Object.values(allGroupedOrders);
  } catch (error) {
    console.error("Error fetching current orders:", error);
    throw new Error("Failed to fetch current orders");
  }
}

// Additional function to get event orders separately if needed
export async function getCurrentEventOrders(): Promise<
  {
    eventName: string;
    bookedBy: string;
    items: DrinkItem[];
    totalAmount: number;
  }[]
> {
  try {
    // Fetch all orders where inBill is false AND bookingFor is NOT null (event orders)
    const eventOrders = await db
      .select()
      .from(orders)
      .where(
        and(eq(orders.inBill, false), sql`${orders.bookingFor} IS NOT NULL`)
      );

    // Group by bookingFor (event name)
    const groupedEvents = eventOrders.reduce((acc, order) => {
      const eventName = order.bookingFor || "Unknown Event";

      if (!acc[eventName]) {
        acc[eventName] = {
          eventName,
          bookedBy: order.userName, // Track who booked it
          items: [],
          totalAmount: 0,
        };
      }

      // Check if this drink already exists in the event's items
      const existingItem = acc[eventName].items.find(
        (item: { name: string; unitPrice: number }) =>
          item.name === order.drinkName && item.unitPrice === order.pricePerUnit
      );

      if (existingItem) {
        existingItem.quantity += order.amount;
        existingItem.subtotal += order.total;
      } else {
        acc[eventName].items.push({
          id: order.id,
          name: order.drinkName,
          quantity: order.amount,
          unitPrice: order.pricePerUnit,
          subtotal: order.total,
        });
      }

      acc[eventName].totalAmount += order.total;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(groupedEvents);
  } catch (error) {
    console.error("Error fetching event orders:", error);
    throw new Error("Failed to fetch event orders");
  }
}
