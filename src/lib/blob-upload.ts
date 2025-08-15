// blob-upload.ts
"use client";

import { upload } from "@vercel/blob/client";

interface UploadImageOptions {
  onProgress?: (progress: number) => void;
}

/**
 * Uploads an image file to Vercel Blob from the client side
 * @param file - The file to upload
 * @param options - Optional configuration for upload
 * @returns The URL of the uploaded image
 */
export async function uploadDrinkImage(
  file: File,
  options?: UploadImageOptions
): Promise<string> {
  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    throw new Error("Bild ist zu groß. Maximale Größe: 5MB");
  }

  // Validate file type
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type)) {
    throw new Error("Ungültiger Dateityp. Erlaubt: JPG, PNG, WebP");
  }

  try {
    const blob = await upload(`drinks/${Date.now()}-${file.name}`, file, {
      access: "public",
      handleUploadUrl: "/api/upload", // You need to create this API route
      onUploadProgress: (progress) => {
        if (options?.onProgress) {
          const percentage = (progress.loaded / progress.total) * 100;
          options.onProgress(percentage);
        }
      },
    });

    return blob.url;
  } catch (error) {
    console.error("Error uploading image:", error);
    throw new Error("Fehler beim Hochladen des Bildes");
  }
}

/**
 * Validates an image file before upload
 * @param file - The file to validate
 * @returns True if valid, throws error if invalid
 */
export function validateImageFile(file: File): boolean {
  const maxSize = 5 * 1024 * 1024; // 5MB
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

  if (file.size > maxSize) {
    throw new Error("Bild ist zu groß. Maximale Größe: 5MB");
  }

  if (!validTypes.includes(file.type)) {
    throw new Error("Ungültiger Dateityp. Erlaubt: JPG, PNG, WebP");
  }

  return true;
}
