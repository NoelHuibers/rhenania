// hooks/useImageManager.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ImageItem } from "~/components/bilder/ImagePreview";
import { uploadHomepageImage, validateImageFile } from "~/lib/image-upload";
import {
  deleteHomepageImage,
  getAllHomepageImages,
  saveHomepageImage,
  toggleImageActive,
  type HomepageSection,
} from "~/server/actions/bilder/homepageImages";

export interface ImageManagerState {
  images: Record<HomepageSection, ImageItem[]>;
  loading: boolean;
  uploading: HomepageSection | null;
  uploadProgress: number;
  deletingId: string | null;
}

export const useImageManager = () => {
  const [state, setState] = useState<ImageManagerState>({
    images: {
      header: [],
      aktive: [],
      haus: [],
      footer: [],
    },
    loading: false,
    uploading: null,
    uploadProgress: 0,
    deletingId: null,
  });

  const headerInputRef = useRef<HTMLInputElement>(null);
  const aktivenInputRef = useRef<HTMLInputElement>(null);
  const hausInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);

  const inputRefs = {
    header: headerInputRef,
    aktive: aktivenInputRef,
    haus: hausInputRef,
    footer: footerInputRef,
  };

  const loadImages = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));

    try {
      const result = await getAllHomepageImages();
      if (result.success && result.data) {
        setState((prev) => ({
          ...prev,
          images: {
            header:
              (result.data as Record<HomepageSection, ImageItem[]>).header ||
              [],
            aktive:
              (result.data as Record<HomepageSection, ImageItem[]>).aktive ||
              [],
            haus:
              (result.data as Record<HomepageSection, ImageItem[]>).haus || [],
            footer:
              (result.data as Record<HomepageSection, ImageItem[]>).footer ||
              [],
          },
        }));
      } else {
        toast.error(result.error || "Fehler beim Laden der Bilder");
      }
    } catch (error) {
      toast.error("Fehler beim Laden der Bilder");
      console.error(error);
    } finally {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const handleFileSelect = useCallback(
    async (files: FileList | null, section: HomepageSection) => {
      if (!files || files.length === 0) return;

      setState((prev) => ({
        ...prev,
        uploading: section,
        uploadProgress: 0,
      }));

      try {
        const fileArray = Array.from(files);
        let successCount = 0;

        for (let i = 0; i < fileArray.length; i++) {
          const file = fileArray[i];

          if (!file) continue;

          if (!file.type.startsWith("image/")) {
            toast.error(`${file.name} ist kein Bild`);
            continue;
          }

          try {
            validateImageFile(file);
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Validierungsfehler"
            );
            continue;
          }

          const baseProgress = (i / fileArray.length) * 100;
          setState((prev) => ({ ...prev, uploadProgress: baseProgress }));

          try {
            const imageUrl = await uploadHomepageImage(file, {
              section,
              onProgress: (fileProgress) => {
                const totalProgress =
                  baseProgress + fileProgress / fileArray.length;
                setState((prev) => ({
                  ...prev,
                  uploadProgress: Math.round(totalProgress),
                }));
              },
            });

            const result = await saveHomepageImage({
              section,
              imageUrl,
              imageName: file.name,
              fileSize: file.size,
              mimeType: file.type,
            });

            if (result.success) {
              successCount++;
              toast.success(`${file.name} erfolgreich hochgeladen`);
            } else {
              toast.error(
                result.error || `Fehler beim Speichern von ${file.name}`
              );
            }
          } catch (uploadError) {
            console.error("Upload error:", uploadError);
            toast.error(`Upload von ${file.name} fehlgeschlagen`);
          }
        }

        if (successCount > 0) {
          await loadImages();
          toast.success(
            `${successCount} Bild${
              successCount > 1 ? "er" : ""
            } erfolgreich hochgeladen`
          );
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Upload fehlgeschlagen"
        );
        console.error(error);
      } finally {
        setState((prev) => ({
          ...prev,
          uploading: null,
          uploadProgress: 0,
        }));
      }
    },
    [loadImages]
  );

  const handleToggleActive = useCallback(
    async (imageId: string) => {
      try {
        const result = await toggleImageActive(imageId);
        if (result.success) {
          toast.success(result.message);
          await loadImages();
        } else {
          toast.error(result.error || "Fehler beim Ändern des Status");
        }
      } catch (error) {
        toast.error("Fehler beim Ändern des Status");
        console.error(error);
      }
    },
    [loadImages]
  );

  const handleDelete = useCallback(
    async (imageId: string, imageName: string) => {
      if (!confirm(`Möchten Sie "${imageName}" wirklich löschen?`)) return;

      setState((prev) => ({ ...prev, deletingId: imageId }));

      try {
        const result = await deleteHomepageImage(imageId);
        if (result.success) {
          toast.success(result.message);
          await loadImages();
        } else {
          toast.error(result.error || "Fehler beim Löschen");
        }
      } catch (error) {
        toast.error("Fehler beim Löschen");
        console.error(error);
      } finally {
        setState((prev) => ({ ...prev, deletingId: null }));
      }
    },
    [loadImages]
  );

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  return {
    ...state,
    inputRefs,
    loadImages,
    handleFileSelect,
    handleToggleActive,
    handleDelete,
  };
};
