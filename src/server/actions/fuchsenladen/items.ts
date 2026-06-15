"use server";

import { del } from "@vercel/blob";
import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "~/server/db";
import { fuchsenItems, fuchsenOrders } from "~/server/db/schema";
import { getCurrentTenantDb } from "~/server/db/tenants";

const addItemSchema = z.object({
	name: z.string().min(1, "Name ist erforderlich").max(255, "Name ist zu lang"),
	price: z
		.number()
		.positive("Preis muss positiv sein")
		.max(999.99, "Preis ist zu hoch"),
	description: z.string().max(500).optional(),
	pictureUrl: z.string().url().optional(),
	isCurrentlyAvailable: z.boolean().default(true),
});

const updateItemSchema = z.object({
	name: z
		.string()
		.min(1, "Name ist erforderlich")
		.max(255, "Name ist zu lang")
		.optional(),
	price: z
		.number()
		.positive("Preis muss positiv sein")
		.max(999.99, "Preis ist zu hoch")
		.optional(),
	description: z.string().max(500).optional(),
	isCurrentlyAvailable: z.boolean().optional(),
	pictureUrl: z.string().url().optional(),
});

export type AddFuchsenItemInput = z.infer<typeof addItemSchema>;
export type UpdateFuchsenItemInput = z.infer<typeof updateItemSchema>;
export type FuchsenItem = typeof fuchsenItems.$inferSelect;

export async function addFuchsenItem(data: {
	name: string;
	price: number;
	description?: string;
	pictureUrl?: string;
	isCurrentlyAvailable: boolean;
}) {
	try {
		const validated = addItemSchema.parse(data);

		const [created] = await db
			.insert(fuchsenItems)
			.values({
				name: validated.name,
				price: validated.price,
				description: validated.description || null,
				picture: validated.pictureUrl || null,
				isCurrentlyAvailable: validated.isCurrentlyAvailable,
			})
			.returning();

		revalidatePath("/fuchsenwart");
		revalidatePath("/fuchsenladen");

		return {
			success: true,
			data: created,
			message: "Artikel erfolgreich hinzugefügt",
		};
	} catch (error) {
		console.error("Error adding fuchsen item:", error);
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: "Validierungsfehler",
				details: error.issues,
			};
		}
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Fehler beim Hinzufügen des Artikels",
		};
	}
}

export async function updateFuchsenItem(
	id: string,
	input: UpdateFuchsenItemInput,
) {
	try {
		const validated = updateItemSchema.parse(input);
		if (Object.keys(validated).length === 0) {
			return {
				success: false,
				error: "Keine Daten zum Aktualisieren angegeben",
			};
		}

		if (validated.pictureUrl) {
			const [current] = await db
				.select()
				.from(fuchsenItems)
				.where(eq(fuchsenItems.id, id))
				.limit(1);
			if (current?.picture && current.picture !== validated.pictureUrl) {
				try {
					await del(current.picture);
				} catch (error) {
					console.error("Error deleting old fuchsen image:", error);
				}
			}
		}

		// biome-ignore lint/suspicious/noExplicitAny: dynamic mapping for partial update
		const updateData: any = {
			...validated,
			updatedAt: new Date(),
		};
		if ("pictureUrl" in updateData) {
			updateData.picture = updateData.pictureUrl;
			delete updateData.pictureUrl;
		}

		const [updated] = await db
			.update(fuchsenItems)
			.set(updateData)
			.where(eq(fuchsenItems.id, id))
			.returning();

		if (!updated) {
			return { success: false, error: "Artikel nicht gefunden" };
		}

		revalidatePath("/fuchsenwart");
		revalidatePath("/fuchsenladen");

		return {
			success: true,
			data: updated,
			message: "Artikel erfolgreich aktualisiert",
		};
	} catch (error) {
		console.error("Error updating fuchsen item:", error);
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: "Validierungsfehler",
				details: error.issues,
			};
		}
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Fehler beim Aktualisieren des Artikels",
		};
	}
}

export async function deleteFuchsenItem(id: string) {
	try {
		const [item] = await db
			.select()
			.from(fuchsenItems)
			.where(eq(fuchsenItems.id, id))
			.limit(1);

		if (item?.picture) {
			try {
				await del(item.picture);
			} catch (error) {
				console.error("Error deleting fuchsen image:", error);
			}
		}

		await db.delete(fuchsenItems).where(eq(fuchsenItems.id, id));

		revalidatePath("/fuchsenwart");
		revalidatePath("/fuchsenladen");

		return { success: true, message: "Artikel erfolgreich gelöscht" };
	} catch (error) {
		console.error("Error deleting fuchsen item:", error);
		return { success: false, error: "Fehler beim Löschen des Artikels" };
	}
}

export async function toggleFuchsenItemAvailability(id: string) {
	try {
		const [current] = await db
			.select()
			.from(fuchsenItems)
			.where(eq(fuchsenItems.id, id))
			.limit(1);

		if (!current) {
			return { success: false, error: "Artikel nicht gefunden" };
		}

		const [updated] = await db
			.update(fuchsenItems)
			.set({
				isCurrentlyAvailable: !current.isCurrentlyAvailable,
				updatedAt: new Date(),
			})
			.where(eq(fuchsenItems.id, id))
			.returning();

		revalidatePath("/fuchsenwart");
		revalidatePath("/fuchsenladen");

		return {
			success: true,
			data: updated,
			message: "Verfügbarkeit erfolgreich geändert",
		};
	} catch (error) {
		console.error("Error toggling fuchsen item availability:", error);
		return { success: false, error: "Fehler beim Ändern der Verfügbarkeit" };
	}
}

export async function getFuchsenItems() {
	try {
		const all = await db
			.select()
			.from(fuchsenItems)
			.orderBy(desc(fuchsenItems.createdAt));
		return all;
	} catch (error) {
		console.error("Error fetching fuchsen items:", error);
		return [];
	}
}

// Customer-facing menu, ordered by total consumption desc — like drinks.
export async function getFuchsenItemsForMenu() {
	try {
		const tenantDb = await getCurrentTenantDb();
		const items = await tenantDb
			.select({
				id: fuchsenItems.id,
				name: fuchsenItems.name,
				price: fuchsenItems.price,
				description: fuchsenItems.description,
				picture: fuchsenItems.picture,
				isCurrentlyAvailable: fuchsenItems.isCurrentlyAvailable,
				createdAt: fuchsenItems.createdAt,
				updatedAt: fuchsenItems.updatedAt,
			})
			.from(fuchsenItems)
			.leftJoin(fuchsenOrders, eq(fuchsenItems.id, fuchsenOrders.itemId))
			.groupBy(
				fuchsenItems.id,
				fuchsenItems.name,
				fuchsenItems.price,
				fuchsenItems.description,
				fuchsenItems.picture,
				fuchsenItems.isCurrentlyAvailable,
				fuchsenItems.createdAt,
				fuchsenItems.updatedAt,
			)
			.orderBy(desc(sql`COALESCE(SUM(${fuchsenOrders.amount}), 0)`));
		return items;
	} catch (error) {
		console.error("Error fetching fuchsen items for menu:", error);
		return [];
	}
}
