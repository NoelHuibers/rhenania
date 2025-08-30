// components/bilder/ImageSection.tsx
"use client";

import { ImageIcon, Plus, Upload } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { HomepageSection } from "~/server/actions/bilder/homepageImages";
import { DropZone } from "./Dropzone";
import type { ImageItem } from "./ImagePreview";
import { OptimizedImagePreview } from "./OptimizedImagePreview";
import { VirtualImageGrid } from "./VirtualImageGrid";

export interface ImageSectionConfig {
  title: string;
  allowMultiple: boolean;
  description: string;
  dropzoneHeight: string;
}

interface EnhancedImageSectionProps {
  section: HomepageSection;
  config: ImageSectionConfig;
  images: ImageItem[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  uploading: HomepageSection | null;
  deletingId: string | null;
  onFileSelect: (files: FileList | null, section: HomepageSection) => void;
  onToggleActive: (imageId: string) => void;
  onDelete: (imageId: string, imageName: string) => void;
}

export const EnhancedImageSection = ({
  section,
  config,
  images,
  inputRef,
  uploading,
  deletingId,
  onFileSelect,
  onToggleActive,
  onDelete,
}: EnhancedImageSectionProps) => {
  const activeCount = useMemo(
    () => images.filter((img) => img.isActive).length,
    [images]
  );

  const getImageSize = useCallback(() => {
    return config.allowMultiple ? "small" : "large";
  }, [config.allowMultiple]);

  const renderInlineDropzoneContent = useCallback(() => {
    if (config.allowMultiple) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center p-1">
          <Plus className="w-4 h-4 text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">Bilder hinzufügen</p>
          <p className="text-xs text-muted-foreground mt-1">
            Mehrfachauswahl möglich
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-2">
        <Upload className="w-6 h-6 text-muted-foreground mb-2" />
        <p className="text-sm font-medium text-foreground mb-1">
          {config.title} Bild hochladen
        </p>
        <p className="text-xs text-muted-foreground">
          Drag & Drop oder klicken zum Auswählen
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Max. 10MB • JPG, PNG, WebP, SVG
        </p>
      </div>
    );
  }, [config]);

  const renderFullSectionDropzoneContent = useCallback(() => {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center p-6">
        <Upload className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium text-foreground mb-2">
          {config.title} Bild hochladen
        </p>
        <p className="text-sm text-muted-foreground">
          Drag & Drop oder klicken zum Auswählen
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Max. 10MB • JPG, PNG, WebP, SVG
        </p>
      </div>
    );
  }, [config]);

  const renderImageGrid = useCallback(() => {
    // If no images, show full-section dropzone
    if (images.length === 0) {
      return (
        <DropZone
          section={section}
          inputRef={inputRef}
          className="min-h-[256px]"
          onFileSelect={onFileSelect}
          uploading={uploading}
        >
          {renderFullSectionDropzoneContent()}
        </DropZone>
      );
    }

    // Use virtual scrolling for large collections (but still show inline dropzone)
    if (config.allowMultiple && images.length > 50) {
      return (
        <div className="space-y-4">
          <VirtualImageGrid
            images={images}
            itemsPerRow={5}
            itemHeight={160}
            containerHeight={400}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
            deletingId={deletingId}
            size={getImageSize()}
          />
          {/* Inline dropzone below virtual grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <DropZone
              section={section}
              inputRef={inputRef}
              className="aspect-square"
              onFileSelect={onFileSelect}
              uploading={uploading}
            >
              {renderInlineDropzoneContent()}
            </DropZone>
          </div>
        </div>
      );
    }

    // Regular grid with inline dropzone
    const gridClasses = config.allowMultiple
      ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
      : "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6";

    const dropzoneClasses = config.allowMultiple ? "size-32" : "w-full h-64";

    return (
      <div className={gridClasses}>
        {images.map((image) => (
          <OptimizedImagePreview
            key={image.id}
            image={image}
            onToggle={() => onToggleActive(image.id)}
            onDelete={() => onDelete(image.id, image.imageName)}
            size={getImageSize()}
            isDeleting={deletingId === image.id}
          />
        ))}
        {/* Inline dropzone as the next "image" in the grid */}
        <DropZone
          section={section}
          inputRef={inputRef}
          className={dropzoneClasses}
          onFileSelect={onFileSelect}
          uploading={uploading}
        >
          {renderInlineDropzoneContent()}
        </DropZone>
      </div>
    );
  }, [
    images,
    config.allowMultiple,
    section,
    inputRef,
    onFileSelect,
    uploading,
    onToggleActive,
    onDelete,
    deletingId,
    getImageSize,
    renderInlineDropzoneContent,
    renderFullSectionDropzoneContent,
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 flex-wrap">
          <ImageIcon className="w-5 h-5" />
          {config.title}
          <Badge variant="secondary">
            {config.allowMultiple ? "Mehrere Bilder" : "Einzelbild"}
          </Badge>
          <Badge variant="outline">{images.length} gesamt</Badge>
          {activeCount > 0 && (
            <Badge className="bg-green-500/10 text-green-600 border-green-500">
              {activeCount} aktiv
            </Badge>
          )}
          {images.length > 50 && (
            <Badge
              variant="outline"
              className="bg-blue-500/10 text-blue-600 border-blue-500"
            >
              Virtuelles Scrollen
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>{renderImageGrid()}</CardContent>
    </Card>
  );
};
