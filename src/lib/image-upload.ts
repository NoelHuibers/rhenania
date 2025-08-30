// lib/blob-upload.ts (Client util)
"use client";

import { upload } from "@vercel/blob/client";

interface UploadImageOptions {
  onProgress?: (progress: number) => void;
  section: "header" | "aktive" | "haus" | "footer";
}

export async function uploadHomepageImage(
  file: File,
  options: UploadImageOptions
): Promise<string> {
  const maxSize = 10 * 1024 * 1024; // 10MB for homepage images
  if (file.size > maxSize) {
    throw new Error("Bild ist zu groß. Maximale Größe: 10MB");
  }

  const validTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/svg+xml",
  ];
  if (!validTypes.includes(file.type)) {
    throw new Error("Ungültiger Dateityp. Erlaubt: JPG, PNG, WebP, SVG");
  }

  try {
    const blob = await upload(
      `homepage/${options.section}/${Date.now()}-${file.name}`,
      file,
      {
        access: "public",
        handleUploadUrl: "/api/upload",
        onUploadProgress: (p) => {
          if (options?.onProgress) {
            options.onProgress((p.loaded / p.total) * 100);
          }
        },
      }
    );
    return blob.url;
  } catch (error) {
    console.error("Error uploading image:", error);
    throw new Error("Fehler beim Hochladen des Bildes: " + error);
  }
}

export function validateImageFile(file: File): boolean {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const validTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/svg+xml",
  ];

  if (file.size > maxSize) {
    throw new Error("Bild ist zu groß. Maximale Größe: 10MB");
  }

  if (!validTypes.includes(file.type)) {
    throw new Error("Ungültiger Dateityp. Erlaubt: JPG, PNG, WebP, SVG");
  }

  return true;
}
