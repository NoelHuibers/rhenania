"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { orders } from "~/server/db/schema";

export async function getUserOrders() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error(
        "Benutzer muss authentifiziert sein, um Bestellungen anzuzeigen"
      );
    }

    const userOrders = await db
      .select({
        id: orders.id,
        createdAt: orders.createdAt,
        drinkName: orders.drinkName,
        amount: orders.amount,
        total: orders.total,
        inBill: orders.inBill,
      })
      .from(orders)
      .where(and(eq(orders.userId, session.user.id), isNull(orders.bookingFor)))
      .orderBy(desc(orders.createdAt));

    return userOrders;
  } catch (error) {
    console.error("Fehler beim Abrufen der Benutzerbestellungen:", error);
    throw error;
  }
}
