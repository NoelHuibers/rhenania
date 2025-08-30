// bilder/ImagePage.tsx
"use client";

import { Suspense, useMemo } from "react";
import { ActionButtons } from "~/components/bilder/ActionButtons";
import { ErrorBoundary } from "~/components/bilder/ErrorBoundary";
import {
  EnhancedImageSection,
  type ImageSectionConfig,
} from "~/components/bilder/ImageSection";
import { LoadingSpinner } from "~/components/bilder/LoadingSpinner";
import { UploadProgress } from "~/components/bilder/UploadProgress";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { useImageManager } from "~/hooks/useImageManager";
import type { HomepageSection } from "~/server/actions/bilder/homepageImages";

// Fallback component for suspense boundaries
const ImageSectionSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="aspect-square bg-gray-200 rounded-lg"></div>
      ))}
    </div>
  </div>
);

export default function AdminImageManager() {
  const {
    images,
    loading,
    uploading,
    uploadProgress,
    deletingId,
    inputRefs,
    loadImages,
    handleFileSelect,
    handleToggleActive,
    handleDelete,
    handleReorder,
  } = useImageManager();

  const sectionConfigs = useMemo<Record<HomepageSection, ImageSectionConfig>>(
    () => ({
      header: {
        title: "Header (Frontpage)",
        allowMultiple: false,
        description: "Einzelbild für den Header-Bereich",
        dropzoneHeight: "min-h-[256px]",
      },
      aktive: {
        title: "Aktive",
        allowMultiple: true,
        description: "Mehrere Bilder für den Aktive-Bereich",
        dropzoneHeight: "min-h-[128px]",
      },
      haus: {
        title: "Haus",
        allowMultiple: true,
        description: "Mehrere Bilder für den Haus-Bereich",
        dropzoneHeight: "min-h-[128px]",
      },
      footer: {
        title: "Footer",
        allowMultiple: false,
        description: "Einzelbild für den Footer-Bereich",
        dropzoneHeight: "min-h-[256px]",
      },
    }),
    []
  );

  // Memoize section order to prevent re-renders
  const sectionOrder = useMemo<HomepageSection[]>(
    () => ["header", "aktive", "haus", "footer"],
    []
  );

  // Memoize statistics for performance
  const statistics = useMemo(() => {
    const totalImages = Object.values(images).flat().length;
    const activeImages = Object.values(images)
      .flat()
      .filter((img) => img.isActive).length;
    return { totalImages, activeImages };
  }, [images]);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background">
        <SiteHeader title="Bilderverwaltung" />
        <div className="max-w-7xl mx-auto space-y-8 p-2">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">
              Verwalte die Bilder für die Rhenania Website
            </p>

            <div className="flex justify-center gap-4 text-sm text-muted-foreground">
              <span>{statistics.totalImages} Bilder gesamt</span>
              <span>•</span>
              <span className="text-green-600">
                {statistics.activeImages} aktiv
              </span>
            </div>
          </div>

          {/* Upload Progress Overlay */}
          <UploadProgress
            uploading={uploading}
            uploadProgress={uploadProgress}
          />

          {/* Image Sections */}
          {sectionOrder.map((section) => (
            <Suspense key={section} fallback={<ImageSectionSkeleton />}>
              <EnhancedImageSection
                section={section}
                config={sectionConfigs[section]}
                images={images[section]}
                inputRef={inputRefs[section]!}
                uploading={uploading}
                deletingId={deletingId}
                onFileSelect={handleFileSelect}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
                onReorder={handleReorder}
              />
            </Suspense>
          ))}

          {/* Action Buttons */}
          <ActionButtons loading={loading} onRefresh={loadImages} />
        </div>
      </div>
    </ErrorBoundary>
  );
}
