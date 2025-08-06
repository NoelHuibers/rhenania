"use server";

import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { drinks } from "~/server/db/schema";

export type MenuItem = typeof drinks.$inferSelect;

// Get all available drinks for customers
export async function getAvailableDrinks() {
  try {
    const availableDrinks = await db
      .select()
      .from(drinks)
      .where(eq(drinks.isCurrentlyAvailable, true))
      .orderBy(drinks.name);

    return availableDrinks;
  } catch (error) {
    console.error("Error fetching available drinks:", error);
    return [];
  }
}

// Get all drinks (including unavailable ones) for display
export async function getAllDrinksForMenu() {
  try {
    const allDrinks = await db.select().from(drinks).orderBy(drinks.name);

    return allDrinks;
  } catch (error) {
    console.error("Error fetching drinks for menu:", error);
    return [];
  }
}

// Get drink by ID
export async function getDrinkById(id: string) {
  try {
    const [drink] = await db
      .select()
      .from(drinks)
      .where(eq(drinks.id, id))
      .limit(1);

    return drink || null;
  } catch (error) {
    console.error("Error fetching drink by ID:", error);
    return null;
  }
}
