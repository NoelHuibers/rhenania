"use client";
import { upload } from "@vercel/blob/client";

interface UploadCSVOptions {
  onProgress?: (progress: number) => void;
}

export async function uploadCSVToBlob(
  csvContent: string,
  fileName: string,
  options?: UploadCSVOptions
): Promise<string> {
  try {
    // Convert CSV string to Blob/File
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const file = new File([blob], fileName, { type: "text/csv" });

    // Upload to Vercel Blob
    const uploadedBlob = await upload(
      `bills/csv/${Date.now()}-${fileName}`,
      file,
      {
        access: "public",
        handleUploadUrl: "/api/upload-csv",
        onUploadProgress: (p) => {
          if (options?.onProgress) {
            options.onProgress((p.loaded / p.total) * 100);
          }
        },
      }
    );

    return uploadedBlob.url;
  } catch (error) {
    console.error("Error uploading CSV:", error);
    throw new Error("Fehler beim Hochladen der CSV: " + error);
  }
}
