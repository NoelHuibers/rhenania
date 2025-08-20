// drinks.ts
"use server";

import { del } from "@vercel/blob";
import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "~/server/db";
import { drinks } from "~/server/db/schema";

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
  pictureUrl: z.string().url().optional(), // Changed from File to URL string
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
  pictureUrl: z.string().url().optional(), // Added for image updates
});

export type AddDrinkInput = z.infer<typeof addDrinkSchema>;
export type UpdateDrinkInput = z.infer<typeof updateDrinkSchema>;

// Type for database drinks
export type Drink = typeof drinks.$inferSelect;

export async function addDrink(data: {
  name: string;
  price: number;
  volume?: number;
  kastengroesse?: number;
  pictureUrl?: string;
  isCurrentlyAvailable: boolean;
}) {
  try {
    // Validate input
    const validatedInput = addDrinkSchema.parse(data);

    // Insert the drink into the database
    const [newDrink] = await db
      .insert(drinks)
      .values({
        name: validatedInput.name,
        price: validatedInput.price,
        volume: validatedInput.volume || null,
        kastengroesse: validatedInput.kastengroesse || null,
        picture: validatedInput.pictureUrl || null,
        isCurrentlyAvailable: validatedInput.isCurrentlyAvailable,
      })
      .returning();

    revalidatePath("/versorger");

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
      error:
        error instanceof Error
          ? error.message
          : "Fehler beim Hinzufügen des Getränks",
    };
  }
}

// Simple update function for inline editing
export async function updateDrink(id: string, input: UpdateDrinkInput) {
  try {
    // Validate input
    const validatedInput = updateDrinkSchema.parse(input);

    if (Object.keys(validatedInput).length === 0) {
      return {
        success: false,
        error: "Keine Daten zum Aktualisieren angegeben",
      };
    }

    // If there's a new picture URL and an old one exists, delete the old one
    if (validatedInput.pictureUrl) {
      const [currentDrink] = await db
        .select()
        .from(drinks)
        .where(eq(drinks.id, id))
        .limit(1);

      if (
        currentDrink?.picture &&
        currentDrink.picture !== validatedInput.pictureUrl
      ) {
        try {
          await del(currentDrink.picture);
        } catch (error) {
          console.error("Error deleting old image:", error);
        }
      }
    }

    const updateData: any = {
      ...validatedInput,
      updatedAt: new Date(),
    };

    // Map pictureUrl to picture field
    if ("pictureUrl" in updateData) {
      updateData.picture = updateData.pictureUrl;
      delete updateData.pictureUrl;
    }

    const [updatedDrink] = await db
      .update(drinks)
      .set(updateData)
      .where(eq(drinks.id, id))
      .returning();

    if (!updatedDrink) {
      return {
        success: false,
        error: "Getränk nicht gefunden",
      };
    }

    revalidatePath("/versorger");

    return {
      success: true,
      data: updatedDrink,
      message: "Getränk erfolgreich aktualisiert",
    };
  } catch (error) {
    console.error("Error updating drink:", error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: "Validierungsfehler",
        details: error.errors,
      };
    }

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Fehler beim Aktualisieren des Getränks",
    };
  }
}

// Function to delete an image
export async function deleteDrinkImage(id: string) {
  try {
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

    if (currentDrink.picture) {
      try {
        await del(currentDrink.picture);
      } catch (error) {
        console.error("Error deleting image:", error);
        return {
          success: false,
          error: "Fehler beim Löschen des Bildes",
        };
      }

      // Update database to remove picture reference
      await db
        .update(drinks)
        .set({
          picture: null,
          updatedAt: new Date(),
        })
        .where(eq(drinks.id, id));
    }

    revalidatePath("/versorger");

    return {
      success: true,
      message: "Bild erfolgreich gelöscht",
    };
  } catch (error) {
    console.error("Error deleting drink image:", error);
    return {
      success: false,
      error: "Fehler beim Löschen des Bildes",
    };
  }
}

export async function deleteDrink(id: string) {
  try {
    // Get the drink to delete its image
    const [drinkToDelete] = await db
      .select()
      .from(drinks)
      .where(eq(drinks.id, id))
      .limit(1);

    if (drinkToDelete && drinkToDelete.picture) {
      try {
        await del(drinkToDelete.picture);
      } catch (error) {
        console.error("Error deleting image:", error);
      }
    }

    await db.delete(drinks).where(eq(drinks.id, id));

    revalidatePath("/versorger");

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

    revalidatePath("/versorger");

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

export async function getDrinks() {
  try {
    const allDrinks = await db
      .select()
      .from(drinks)
      .orderBy(desc(drinks.createdAt));

    return allDrinks;
  } catch (error) {
    console.error("Error fetching drinks:", error);
    return [];
  }
}
