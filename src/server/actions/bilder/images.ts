// app/actions/homepage-images.ts
"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "~/server/db";
import { homepageImages } from "~/server/db/schema";

export async function getActiveImageBySection(
  section: "header" | "aktive" | "haus" | "footer"
) {
  try {
    const images = await db
      .select()
      .from(homepageImages)
      .where(
        and(
          eq(homepageImages.section, section),
          eq(homepageImages.isActive, true)
        )
      )
      .orderBy(desc(homepageImages.displayOrder))
      .limit(1);

    return images[0] || null;
  } catch (error) {
    console.error(`Error fetching ${section} image:`, error);
    return null;
  }
}

export async function getAllActiveImagesBySection(
  section: "header" | "aktive" | "haus" | "footer"
) {
  try {
    const images = await db
      .select()
      .from(homepageImages)
      .where(
        and(
          eq(homepageImages.section, section),
          eq(homepageImages.isActive, true)
        )
      )
      .orderBy(homepageImages.displayOrder);

    return images;
  } catch (error) {
    console.error(`Error fetching ${section} images:`, error);
    return [];
  }
}

export async function uploadHomepageImage({
  section,
  imageUrl,
  imageName,
  fileSize,
  mimeType,
  displayOrder = 0,
  uploadedBy,
}: {
  section: "header" | "aktive" | "haus" | "footer";
  imageUrl: string;
  imageName: string;
  fileSize?: number;
  mimeType?: string;
  displayOrder?: number;
  uploadedBy?: string;
}) {
  try {
    const result = await db.insert(homepageImages).values({
      section,
      imageUrl,
      imageName,
      fileSize,
      mimeType,
      displayOrder,
      uploadedBy,
      isActive: true,
    });

    revalidatePath("/");
    return { success: true, data: result };
  } catch (error) {
    console.error("Error uploading homepage image:", error);
    return { success: false, error: "Failed to upload image" };
  }
}

export async function toggleImageActive(imageId: string) {
  try {
    const image = await db
      .select()
      .from(homepageImages)
      .where(eq(homepageImages.id, imageId))
      .limit(1);

    if (!image[0]) {
      return { success: false, error: "Image not found" };
    }

    await db
      .update(homepageImages)
      .set({ isActive: !image[0].isActive })
      .where(eq(homepageImages.id, imageId));

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Error toggling image active status:", error);
    return { success: false, error: "Failed to toggle image status" };
  }
}

export async function updateImageOrder(imageId: string, newOrder: number) {
  try {
    await db
      .update(homepageImages)
      .set({ displayOrder: newOrder })
      .where(eq(homepageImages.id, imageId));

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Error updating image order:", error);
    return { success: false, error: "Failed to update image order" };
  }
}

export async function deleteHomepageImage(imageId: string) {
  try {
    await db.delete(homepageImages).where(eq(homepageImages.id, imageId));

    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.error("Error deleting image:", error);
    return { success: false, error: "Failed to delete image" };
  }
}
