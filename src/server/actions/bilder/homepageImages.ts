// app/actions/homepage-images.ts
"use server";

import { del } from "@vercel/blob";
import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { homepageImages } from "~/server/db/schema";

export type HomepageSection = "header" | "aktive" | "haus" | "footer";

interface SaveHomepageImageData {
  section: HomepageSection;
  imageUrl: string;
  imageName: string;
  fileSize?: number;
  mimeType?: string;
}

interface HomepageImageResponse {
  id: string;
  section: HomepageSection;
  imageUrl: string;
  imageName: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: Date;
}

// Save a new homepage image
export async function saveHomepageImage(data: SaveHomepageImageData) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Nicht autorisiert");
    }

    // Check if section allows multiple images
    const isMultipleAllowed =
      data.section === "aktive" || data.section === "haus";

    if (!isMultipleAllowed) {
      // Deactivate existing images for single-image sections
      await db
        .update(homepageImages)
        .set({ isActive: false })
        .where(
          and(
            eq(homepageImages.section, data.section),
            eq(homepageImages.isActive, true)
          )
        );
    }

    // Get the next display order
    const maxOrder = await db
      .select({ maxOrder: homepageImages.displayOrder })
      .from(homepageImages)
      .where(eq(homepageImages.section, data.section))
      .orderBy(desc(homepageImages.displayOrder))
      .limit(1);

    const nextOrder = (maxOrder[0]?.maxOrder ?? -1) + 1;

    // Insert new image
    const [newImage] = await db
      .insert(homepageImages)
      .values({
        section: data.section,
        imageUrl: data.imageUrl,
        imageName: data.imageName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        displayOrder: nextOrder,
        isActive: true,
        uploadedBy: session.user.id,
      })
      .returning();

    revalidatePath("/");
    revalidatePath("/admin");

    return {
      success: true,
      data: newImage,
      message: "Bild erfolgreich hochgeladen",
    };
  } catch (error) {
    console.error("Error saving homepage image:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern des Bildes",
    };
  }
}

// Get all active images for a section
export async function getActiveHomepageImages(section?: HomepageSection) {
  try {
    const whereConditions = section
      ? and(
          eq(homepageImages.isActive, true),
          eq(homepageImages.section, section)
        )
      : eq(homepageImages.isActive, true);

    const images = await db
      .select()
      .from(homepageImages)
      .where(whereConditions)
      .orderBy(homepageImages.displayOrder);

    return {
      success: true,
      data: images as HomepageImageResponse[],
    };
  } catch (error) {
    console.error("Error fetching homepage images:", error);
    return {
      success: false,
      error: "Fehler beim Laden der Bilder",
      data: [],
    };
  }
}

// Get all images (including inactive) for admin panel
export async function getAllHomepageImages() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Nicht autorisiert");
    }

    const images = await db
      .select()
      .from(homepageImages)
      .orderBy(homepageImages.section, homepageImages.displayOrder);

    const grouped = images.reduce((acc, img) => {
      if (!acc[img.section]) {
        acc[img.section] = [];
      }
      acc[img.section].push(img);
      return acc;
    }, {} as Record<HomepageSection, typeof images>);

    return {
      success: true,
      data: grouped,
    };
  } catch (error) {
    console.error("Error fetching all homepage images:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Fehler beim Laden der Bilder",
      data: {},
    };
  }
}

// Toggle image active status
export async function toggleImageActive(imageId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Nicht autorisiert");
    }

    const [image] = await db
      .select()
      .from(homepageImages)
      .where(eq(homepageImages.id, imageId))
      .limit(1);

    if (!image) {
      throw new Error("Bild nicht gefunden");
    }

    // Check if section allows multiple active images
    const isMultipleAllowed =
      image.section === "aktive" || image.section === "haus";

    if (!isMultipleAllowed && !image.isActive) {
      // Deactivate other images in the section first
      await db
        .update(homepageImages)
        .set({ isActive: false })
        .where(
          and(
            eq(homepageImages.section, image.section),
            eq(homepageImages.isActive, true)
          )
        );
    }

    const [updated] = await db
      .update(homepageImages)
      .set({ isActive: !image.isActive })
      .where(eq(homepageImages.id, imageId))
      .returning();

    if (!updated) {
      throw new Error("Fehler beim Aktualisieren des Bildes");
    }

    revalidatePath("/");
    revalidatePath("/admin");

    return {
      success: true,
      data: updated,
      message: `Bild ${updated.isActive ? "aktiviert" : "deaktiviert"}`,
    };
  } catch (error) {
    console.error("Error toggling image active status:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Fehler beim Ändern des Status",
    };
  }
}

// Delete image
export async function deleteHomepageImage(imageId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Nicht autorisiert");
    }

    const [image] = await db
      .select()
      .from(homepageImages)
      .where(eq(homepageImages.id, imageId))
      .limit(1);

    if (!image) {
      throw new Error("Bild nicht gefunden");
    }

    // Delete from blob storage
    try {
      await del(image.imageUrl);
    } catch (blobError) {
      console.error("Error deleting from blob storage:", blobError);
      // Continue with database deletion even if blob deletion fails
    }

    // Delete from database
    await db.delete(homepageImages).where(eq(homepageImages.id, imageId));

    revalidatePath("/");
    revalidatePath("/admin");

    return {
      success: true,
      message: "Bild erfolgreich gelöscht",
    };
  } catch (error) {
    console.error("Error deleting homepage image:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Fehler beim Löschen des Bildes",
    };
  }
}

// Update display order
export async function updateImageOrder(imageId: string, newOrder: number) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Nicht autorisiert");
    }

    const [updated] = await db
      .update(homepageImages)
      .set({ displayOrder: newOrder })
      .where(eq(homepageImages.id, imageId))
      .returning();

    revalidatePath("/");
    revalidatePath("/admin");

    return {
      success: true,
      data: updated,
      message: "Reihenfolge aktualisiert",
    };
  } catch (error) {
    console.error("Error updating image order:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Fehler beim Aktualisieren der Reihenfolge",
    };
  }
}

// Reorder images within a section
export async function reorderSectionImages(
  section: HomepageSection,
  imageIds: string[]
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      throw new Error("Nicht autorisiert");
    }

    // Update each image with its new order
    const updates = imageIds.map((id, index) =>
      db
        .update(homepageImages)
        .set({ displayOrder: index })
        .where(eq(homepageImages.id, id))
    );

    await Promise.all(updates);

    revalidatePath("/");
    revalidatePath("/admin");

    return {
      success: true,
      message: "Reihenfolge erfolgreich aktualisiert",
    };
  } catch (error) {
    console.error("Error reordering images:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Fehler beim Sortieren der Bilder",
    };
  }
}
