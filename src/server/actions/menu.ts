"use server";

import { desc, eq, sql } from "drizzle-orm";
import { drinks, orders } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";
import { requireMember } from "~/server/lib/authz";
import { getDrinkPricingConfig } from "~/server/lib/getraenke-settings";

export type MenuItem = typeof drinks.$inferSelect;

/**
 * Markup the menu has to add to personal orders so it shows the price the
 * member is actually charged. 0 for tenants without the markup feature.
 */
export async function getDrinkMarkupPercent(): Promise<number> {
	await requireMember();
	return (await getDrinkPricingConfig()).markupPercent;
}

// A failed read throws: the callers show an error instead of an empty
// menu that looks like "no drinks" (#216).

// Get all available drinks for customers, sorted by total consumption desc
// — same ordering as the customer-facing drinks tab so the most-ordered
// drinks appear first.
export async function getAvailableDrinks() {
	await requireMember();
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
}

// Get all drinks (including unavailable ones) for display
export async function getAllDrinksForMenu() {
	await requireMember();
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
}
