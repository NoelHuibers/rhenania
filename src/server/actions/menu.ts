"use server";

import { desc, eq, sql } from "drizzle-orm";
import { drinks, orders } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";

export type MenuItem = typeof drinks.$inferSelect;

// Get all available drinks for customers, sorted by total consumption desc
// — same ordering as the customer-facing drinks tab so the most-ordered
// drinks appear first.
export async function getAvailableDrinks() {
	try {
		const db = await getCurrentTenantDb();
		const availableDrinks = await db
			.select({
				id: drinks.id,
				name: drinks.name,
				price: drinks.price,
				kastengroesse: drinks.kastengroesse,
				volume: drinks.volume,
				picture: drinks.picture,
				isCurrentlyAvailable: drinks.isCurrentlyAvailable,
				createdAt: drinks.createdAt,
				updatedAt: drinks.updatedAt,
			})
			.from(drinks)
			.leftJoin(orders, eq(drinks.id, orders.drinkId))
			.where(eq(drinks.isCurrentlyAvailable, true))
			.groupBy(
				drinks.id,
				drinks.name,
				drinks.price,
				drinks.kastengroesse,
				drinks.volume,
				drinks.picture,
				drinks.isCurrentlyAvailable,
				drinks.createdAt,
				drinks.updatedAt,
			)
			.orderBy(desc(sql`COALESCE(SUM(${orders.amount}), 0)`));

		return availableDrinks;
	} catch (error) {
		console.error("Error fetching available drinks:", error);
		return [];
	}
}

// Get all drinks (including unavailable ones) for display
export async function getAllDrinksForMenu() {
	try {
		const db = await getCurrentTenantDb();
		// Get all drinks with their total consumption amount
		const allDrinks = await db
			.select({
				id: drinks.id,
				name: drinks.name,
				price: drinks.price,
				kastengroesse: drinks.kastengroesse,
				volume: drinks.volume,
				picture: drinks.picture,
				isCurrentlyAvailable: drinks.isCurrentlyAvailable,
				createdAt: drinks.createdAt,
				updatedAt: drinks.updatedAt,
				totalConsumption: sql`COALESCE(SUM(${orders.amount}), 0)`.as(
					"totalConsumption",
				),
			})
			.from(drinks)
			.leftJoin(orders, eq(drinks.id, orders.drinkId))
			.groupBy(
				drinks.id,
				drinks.name,
				drinks.price,
				drinks.kastengroesse,
				drinks.volume,
				drinks.picture,
				drinks.isCurrentlyAvailable,
				drinks.createdAt,
				drinks.updatedAt,
			)
			.orderBy(desc(sql`COALESCE(SUM(${orders.amount}), 0)`)); // Order by total consumption descending

		return allDrinks;
	} catch (error) {
		console.error("Error fetching drinks for menu:", error);
		return [];
	}
}

// Get drink by ID
export async function getDrinkById(id: string) {
	try {
		const db = await getCurrentTenantDb();
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
