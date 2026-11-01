// drinks.ts
"use server";

import { del } from "@vercel/blob";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/server/db";
import { drinks } from "~/server/db/schema";
import { ROLES, requireRole } from "~/server/lib/authz";
import { isForeignKeyViolation } from "~/server/lib/db-errors";
import { defineAction } from "~/server/lib/define-action";
import {
	ConflictError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";

const INVALID_PICTURE_URL = "Ungültige Bild-Adresse";

const addDrinkSchema = z.object({
	name: z.string().min(1, "Name ist erforderlich").max(255, "Name ist zu lang"),
	price: z
		.number()
		.positive("Preis muss positiv sein")
		.max(999.99, "Preis ist zu hoch"),
	volume: z
		.number()
		.positive("Volumen muss positiv sein")
		.max(999.99, "Volumen ist zu hoch")
		.optional(),
	kastengroesse: z
		.number()
		.int("Kastengröße muss eine ganze Zahl sein")
		.positive("Kastengröße muss positiv sein")
		.max(999, "Kastengröße ist zu hoch")
		.optional(),
	pictureUrl: z.string().url(INVALID_PICTURE_URL).optional(),
	isCurrentlyAvailable: z.boolean().default(true),
});

const updateDrinkSchema = z.object({
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
	volume: z
		.number()
		.positive("Volumen muss positiv sein")
		.max(999.99, "Volumen ist zu hoch")
		.optional(),
	kastengroesse: z
		.number()
		.int("Kastengröße muss eine ganze Zahl sein")
		.positive("Kastengröße muss positiv sein")
		.max(999, "Kastengröße ist zu hoch")
		.optional(),
	isCurrentlyAvailable: z.boolean().optional(),
	pictureUrl: z.string().url(INVALID_PICTURE_URL).optional(),
});

// Type for database drinks
export type Drink = typeof drinks.$inferSelect;

export const addDrink = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([addDrinkSchema]),
		revalidate: ["/getraenkewart"],
		errorMessage: "Fehler beim Hinzufügen des Getränks",
	},
	async ([input], { tenant }) => {
		const [newDrink] = await tenant.db
			.insert(drinks)
			.values({
				name: input.name,
				price: input.price,
				volume: input.volume || null,
				kastengroesse: input.kastengroesse || null,
				picture: input.pictureUrl || null,
				isCurrentlyAvailable: input.isCurrentlyAvailable,
			})
			.returning();
		return newDrink;
	},
);

/** Inline editing on the Getränkewart page; replacing the picture drops the old blob. */
export const updateDrink = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string(), updateDrinkSchema]),
		revalidate: ["/getraenkewart"],
		errorMessage: "Fehler beim Aktualisieren des Getränks",
	},
	async ([id, input], { tenant }) => {
		if (Object.keys(input).length === 0) {
			throw new ValidationError("Keine Daten zum Aktualisieren angegeben");
		}
		const { db } = tenant;
		const { pictureUrl, ...fields } = input;

		// If there's a new picture URL and an old one exists, delete the old one
		if (pictureUrl) {
			const [currentDrink] = await db
				.select()
				.from(drinks)
				.where(eq(drinks.id, id))
				.limit(1);

			if (currentDrink?.picture && currentDrink.picture !== pictureUrl) {
				try {
					await del(currentDrink.picture);
				} catch (error) {
					console.error("Error deleting old image:", error);
				}
			}
		}

		const [updatedDrink] = await db
			.update(drinks)
			.set({
				...fields,
				...(pictureUrl !== undefined && { picture: pictureUrl }),
				updatedAt: tenant.now(),
			})
			.where(eq(drinks.id, id))
			.returning();

		if (!updatedDrink) {
			throw new NotFoundError(DRINK_NOT_FOUND);
		}
		return updatedDrink;
	},
);

const DRINK_NOT_FOUND = "Getränk nicht gefunden";
const DRINK_IN_USE_ERROR =
	"Das Getränk wurde schon bestellt oder gezählt und kann deshalb nicht gelöscht werden. Setze es stattdessen auf „Nicht verfügbar“.";

export const deleteDrink = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string()]),
		revalidate: ["/getraenkewart"],
		errorMessage: "Fehler beim Löschen des Getränks",
	},
	async ([id], { tenant }) => {
		// Delete the row first: orders and inventory counts reference it, and the
		// picture must survive when the database refuses the delete.
		let deleted: { picture: string | null } | undefined;
		try {
			[deleted] = await tenant.db
				.delete(drinks)
				.where(eq(drinks.id, id))
				.returning({ picture: drinks.picture });
		} catch (error) {
			if (isForeignKeyViolation(error)) {
				throw new ConflictError(DRINK_IN_USE_ERROR, "DRINK_IN_USE");
			}
			throw error;
		}

		if (deleted?.picture) {
			try {
				await del(deleted.picture);
			} catch (error) {
				console.error("Error deleting image:", error);
			}
		}
	},
);

export const toggleDrinkAvailability = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string()]),
		revalidate: ["/getraenkewart"],
		errorMessage: "Fehler beim Ändern der Verfügbarkeit",
	},
	async ([id], { tenant }) => {
		const { db } = tenant;
		const [currentDrink] = await db
			.select()
			.from(drinks)
			.where(eq(drinks.id, id))
			.limit(1);

		if (!currentDrink) {
			throw new NotFoundError(DRINK_NOT_FOUND);
		}

		const [updatedDrink] = await db
			.update(drinks)
			.set({
				isCurrentlyAvailable: !currentDrink.isCurrentlyAvailable,
				updatedAt: tenant.now(),
			})
			.where(eq(drinks.id, id))
			.returning();
		return updatedDrink;
	},
);

export async function getDrinks() {
	await requireRole(ROLES.getraenke);
	try {
		const allDrinks = await db
			.select()
			.from(drinks)
			// rowid breaks ties between drinks created in the same second.
			.orderBy(desc(drinks.createdAt), sql`${drinks}.rowid`);

		return allDrinks;
	} catch (error) {
		console.error("Error fetching drinks:", error);
		return [];
	}
}
