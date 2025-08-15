// drinks.ts
"use server";

import { del, put } from "@vercel/blob";
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
  pictureFile: z.instanceof(File).optional(),
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
});

export type AddDrinkInput = z.infer<typeof addDrinkSchema>;
export type UpdateDrinkInput = z.infer<typeof updateDrinkSchema>;

// Type for database drinks
export type Drink = typeof drinks.$inferSelect;

export async function addDrink(formData: FormData) {
  try {
    const name = formData.get("name") as string;
    const price = parseFloat(formData.get("price") as string);
    const volumeRaw = formData.get("volume") as string;
    const volume = volumeRaw ? parseFloat(volumeRaw) : undefined;
    const kastengroesseRaw = formData.get("kastengroesse") as string;
    const kastengroesse = kastengroesseRaw
      ? parseInt(kastengroesseRaw)
      : undefined;
    const pictureFile = formData.get("picture") as File | null;
    const isCurrentlyAvailable =
      formData.get("isCurrentlyAvailable") === "true";

    // Validate input
    const validatedInput = addDrinkSchema.parse({
      name,
      price,
      volume,
      kastengroesse,
      pictureFile: pictureFile || undefined,
      isCurrentlyAvailable,
    });

    let pictureUrl: string | null = null;

    // Upload image to Vercel Blob if provided
    if (pictureFile && pictureFile.size > 0) {
      try {
        const blob = await put(
          `drinks/${Date.now()}-${pictureFile.name}`,
          pictureFile,
          {
            access: "public",
          }
        );
        pictureUrl = blob.url;
      } catch (uploadError) {
        console.error("Error uploading image:", uploadError);
        throw new Error("Fehler beim Hochladen des Bildes");
      }
    }

    // Insert the drink into the database
    const [newDrink] = await db
      .insert(drinks)
      .values({
        name: validatedInput.name,
        price: validatedInput.price,
        volume: validatedInput.volume || null,
        kastengroesse: validatedInput.kastengroesse || null,
        picture: pictureUrl,
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

// Simple update function for inline editing (name, price, volume, and kastengroesse)
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

    const updateData: any = {
      ...validatedInput,
      updatedAt: new Date(),
    };

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

    revalidatePath("/admin/drinks");

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

// Advanced update function with file upload (for future use)
export async function updateDrinkWithImage(id: string, formData: FormData) {
  try {
    const name = formData.get("name") as string;
    const price = formData.get("price") as string;
    const volumeRaw = formData.get("volume") as string;
    const kastengroesseRaw = formData.get("kastengroesse") as string;
    const pictureFile = formData.get("picture") as File | null;
    const keepExistingPicture = formData.get("keepExistingPicture") === "true";

    // Get current drink to handle image deletion
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

    let pictureUrl: string | null = currentDrink.picture;

    // Handle image update
    if (pictureFile && pictureFile.size > 0) {
      // Delete old image if exists
      if (currentDrink.picture) {
        try {
          await del(currentDrink.picture);
        } catch (error) {
          console.error("Error deleting old image:", error);
        }
      }

      // Upload new image
      try {
        const blob = await put(
          `drinks/${Date.now()}-${pictureFile.name}`,
          pictureFile,
          {
            access: "public",
          }
        );
        pictureUrl = blob.url;
      } catch (uploadError) {
        console.error("Error uploading new image:", uploadError);
        throw new Error("Fehler beim Hochladen des neuen Bildes");
      }
    } else if (!keepExistingPicture && currentDrink.picture) {
      // User wants to remove the picture
      try {
        await del(currentDrink.picture);
        pictureUrl = null;
      } catch (error) {
        console.error("Error deleting image:", error);
      }
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (name) updateData.name = name;
    if (price) updateData.price = parseFloat(price);
    if (volumeRaw) updateData.volume = parseFloat(volumeRaw);
    if (kastengroesseRaw) updateData.kastengroesse = parseInt(kastengroesseRaw);
    updateData.picture = pictureUrl;

    const [updatedDrink] = await db
      .update(drinks)
      .set(updateData)
      .where(eq(drinks.id, id))
      .returning();

    revalidatePath("/versorger");

    return {
      success: true,
      data: updatedDrink,
      message: "Getränk erfolgreich aktualisiert",
    };
  } catch (error) {
    console.error("Error updating drink:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Fehler beim Aktualisieren des Getränks",
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
