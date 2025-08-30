// hooks/useImageManager.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ImageItem } from "~/components/bilder/OptimizedImagePreview";
import { uploadHomepageImage, validateImageFile } from "~/lib/image-upload";
import {
  deleteHomepageImage,
  getAllHomepageImages,
  saveHomepageImage,
  toggleImageActive,
  updateImageOrder,
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
        const newImages: ImageItem[] = [];

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

            if (result.success && result.data) {
              successCount++;
              newImages.push(result.data as ImageItem);
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

        // Optimistically add new images to state
        if (newImages.length > 0) {
          setState((prev) => ({
            ...prev,
            images: {
              ...prev.images,
              [section]: [...prev.images[section], ...newImages],
            },
          }));

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
    []
  );

  const handleToggleActive = useCallback(
    async (imageId: string) => {
      // Find the image and its section
      let targetSection: HomepageSection | null = null;
      let targetImage: ImageItem | null = null;

      setState((prev) => {
        const newImages = { ...prev.images };

        for (const section in newImages) {
          const sectionImages = newImages[section as HomepageSection];
          const imageIndex = sectionImages.findIndex(
            (img) => img.id === imageId
          );

          if (imageIndex !== -1) {
            targetSection = section as HomepageSection;
            targetImage = { ...sectionImages[imageIndex] } as ImageItem;

            // Optimistic update
            const isMultipleAllowed =
              section === "aktive" || section === "haus";

            // If single image section and we're activating
            if (!isMultipleAllowed && !targetImage.isActive) {
              // Deactivate all other images in this section
              newImages[section as HomepageSection] = sectionImages.map(
                (img) => ({
                  ...img,
                  isActive: img.id === imageId,
                })
              );
            } else {
              // Just toggle the target image
              newImages[section as HomepageSection] = sectionImages.map((img) =>
                img.id === imageId ? { ...img, isActive: !img.isActive } : img
              );
            }

            break;
          }
        }

        return { ...prev, images: newImages };
      });

      try {
        const result = await toggleImageActive(imageId);

        if (result.success) {
          toast.success(result.message);

          // If other images were deactivated, update them
          if (result.deactivatedIds && result.deactivatedIds.length > 0) {
            setState((prev) => {
              const newImages = { ...prev.images };

              for (const section in newImages) {
                newImages[section as HomepageSection] = newImages[
                  section as HomepageSection
                ].map((img) => {
                  if (result.deactivatedIds?.includes(img.id)) {
                    return { ...img, isActive: false };
                  }
                  return img;
                });
              }

              return { ...prev, images: newImages };
            });
          }
        } else {
          // Revert optimistic update on error
          toast.error(result.error || "Fehler beim Ändern des Status");
          await loadImages();
        }
      } catch (error) {
        // Revert optimistic update on error
        toast.error("Fehler beim Ändern des Status");
        console.error(error);
        await loadImages();
      }
    },
    [loadImages]
  );

  const handleDelete = useCallback(
    async (imageId: string, imageName: string) => {
      setState((prev) => ({ ...prev, deletingId: imageId }));

      // Optimistic update - remove image from state
      setState((prev) => {
        const newImages = { ...prev.images };

        for (const section in newImages) {
          const sectionImages = newImages[section as HomepageSection];
          const filteredImages = sectionImages.filter(
            (img) => img.id !== imageId
          );

          if (filteredImages.length < sectionImages.length) {
            newImages[section as HomepageSection] = filteredImages;
            break;
          }
        }

        return { ...prev, images: newImages };
      });

      try {
        const result = await deleteHomepageImage(imageId);

        if (result.success) {
          toast.success(`"${imageName}" wurde gelöscht`);
        } else {
          // Revert optimistic update on error
          toast.error(result.error || "Fehler beim Löschen");
          await loadImages();
        }
      } catch (error) {
        // Revert optimistic update on error
        toast.error("Fehler beim Löschen");
        console.error(error);
        await loadImages();
      } finally {
        setState((prev) => ({ ...prev, deletingId: null }));
      }
    },
    [loadImages]
  );

  const handleReorder = useCallback(
    async (imageIds: string[]) => {
      // Find which section contains these images
      let targetSection: HomepageSection | null = null;

      for (const section in state.images) {
        const sectionImages = state.images[section as HomepageSection];
        if (sectionImages.some((img) => imageIds.includes(img.id))) {
          targetSection = section as HomepageSection;
          break;
        }
      }

      if (!targetSection) return;

      // Optimistic update
      setState((prev) => {
        const newImages = { ...prev.images };
        const sectionImages = newImages[targetSection];

        // Create a map of id to image for quick lookup
        const imageMap = new Map(sectionImages.map((img) => [img.id, img]));

        // Reorder based on the new imageIds array
        const reorderedImages = imageIds
          .map((id) => imageMap.get(id))
          .filter(Boolean) as ImageItem[];

        // Update display order
        reorderedImages.forEach((img, index) => {
          img.displayOrder = index;
        });

        newImages[targetSection] = reorderedImages;

        return { ...prev, images: newImages };
      });

      try {
        const result = await updateImageOrder(imageIds);

        if (result.success) {
          toast.success("Reihenfolge aktualisiert");
        } else {
          // Revert optimistic update on error
          toast.error(
            result.error || "Fehler beim Aktualisieren der Reihenfolge"
          );
          await loadImages();
        }
      } catch (error) {
        // Revert optimistic update on error
        toast.error("Fehler beim Aktualisieren der Reihenfolge");
        console.error(error);
        await loadImages();
      }
    },
    [state.images, loadImages]
  );

  // Load images only on mount
  useEffect(() => {
    loadImages();
  }, []); // Empty dependency array - only run once

  return {
    ...state,
    inputRefs,
    loadImages,
    handleFileSelect,
    handleToggleActive,
    handleDelete,
    handleReorder,
  };
};
