"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "~/server/db";
import { drinks } from "~/server/db/schema";

export type Drink = typeof drinks.$inferSelect;

// Validation schema
const addDrinkSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(255, "Name ist zu lang"),
  price: z
    .number()
    .positive("Preis muss positiv sein")
    .max(999.99, "Preis ist zu hoch"),
  picture: z.string().optional(),
  isCurrentlyAvailable: z.boolean().default(true),
});

export type AddDrinkInput = z.infer<typeof addDrinkSchema>;

export async function addDrink(input: AddDrinkInput) {
  try {
    // Validate input
    const validatedInput = addDrinkSchema.parse(input);

    // Insert the drink into the database
    const [newDrink] = await db
      .insert(drinks)
      .values({
        name: validatedInput.name,
        price: validatedInput.price,
        picture: validatedInput.picture || null,
        isCurrentlyAvailable: validatedInput.isCurrentlyAvailable,
      })
      .returning();

    // Revalidate the drinks page to show the new drink
    revalidatePath("/admin/drinks");

    return {
      success: true,
      data: newDrink,
      message: "Getränk erfolgreich hinzugefügt",
    };
  } catch (error) {
    console.error("Error adding drink:", error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Validierungsfehler",
        details: error.errors,
      };
    }

    return {
      success: false,
      error: "Fehler beim Hinzufügen des Getränks",
    };
  }
}

// Additional server actions for complete CRUD operations
export async function updateDrink(id: string, input: Partial<AddDrinkInput>) {
  try {
    // Validate input (partial validation for updates)
    const updateSchema = addDrinkSchema.partial();
    const validatedInput = updateSchema.parse(input);

    const [updatedDrink] = await db
      .update(drinks)
      .set({
        ...validatedInput,
        updatedAt: new Date(),
      })
      .where(eq(drinks.id, id))
      .returning();

    revalidatePath("/admin/drinks");

    return {
      success: true,
      data: updatedDrink,
      message: "Getränk erfolgreich aktualisiert",
    };
  } catch (error) {
    console.error("Error updating drink:", error);
    return {
      success: false,
      error: "Fehler beim Aktualisieren des Getränks",
    };
  }
}

export async function deleteDrink(id: string) {
  try {
    await db.delete(drinks).where(eq(drinks.id, id));

    revalidatePath("/admin/drinks");

    return {
      success: true,
      message: "Getränk erfolgreich gelöscht",
    };
  } catch (error) {
    console.error("Error deleting drink:", error);
    return {
      success: false,
      error: "Fehler beim Löschen des Getränks",
    };
  }
}

export async function toggleDrinkAvailability(id: string) {
  try {
    // First get the current drink to toggle its availability
    const [currentDrink] = await db
      .select()
      .from(drinks)
      .where(eq(drinks.id, id))
      .limit(1);

    if (!currentDrink) {
      return {
        success: false,
        error: "Getränk nicht gefunden",
      };
    }

    const [updatedDrink] = await db
      .update(drinks)
      .set({
        isCurrentlyAvailable: !currentDrink.isCurrentlyAvailable,
        updatedAt: new Date(),
      })
      .where(eq(drinks.id, id))
      .returning();

    revalidatePath("/admin/drinks");

    return {
      success: true,
      data: updatedDrink,
      message: "Verfügbarkeit erfolgreich geändert",
    };
  } catch (error) {
    console.error("Error toggling drink availability:", error);
    return {
      success: false,
      error: "Fehler beim Ändern der Verfügbarkeit",
    };
  }
}

// Get all drinks
export async function getDrinks() {
  try {
    const allDrinks = await db.select().from(drinks);

    return allDrinks;
  } catch (error) {
    console.error("Error fetching drinks:", error);
    return [];
  }
}
