// lib/blob-upload.ts (Client util)
"use client";
import { upload } from "@vercel/blob/client";

interface UploadImageOptions {
  onProgress?: (progress: number) => void;
}

export async function uploadDrinkImage(
  file: File,
  options?: UploadImageOptions
): Promise<string> {
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize)
    throw new Error("Bild ist zu groß. Maximale Größe: 5MB");

  // gleiche Liste wie im Server!
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!validTypes.includes(file.type))
    throw new Error("Ungültiger Dateityp. Erlaubt: JPG, PNG, WebP");

  try {
    const blob = await upload(`drinks/${Date.now()}-${file.name}`, file, {
      access: "public",
      handleUploadUrl: "/api/upload",
      onUploadProgress: (p) => {
        if (options?.onProgress) options.onProgress((p.loaded / p.total) * 100);
      },
    });
    return blob.url;
  } catch (error) {
    console.error("Error uploading image:", error);
    throw new Error("Fehler beim Hochladen des Bildes: " + error);
  }
}

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
