// components/image-manager/VirtualImageGrid.tsx
"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { ImageItem } from "./OptimizedImagePreview";
import { OptimizedImagePreview } from "./OptimizedImagePreview";

interface VirtualImageGridProps {
  images: ImageItem[];
  itemsPerRow: number;
  itemHeight: number;
  containerHeight: number;
  onToggleActive: (imageId: string) => void;
  onDelete: (imageId: string, imageName: string) => void;
  deletingId: string | null;
  size?: "small" | "medium" | "large";
}

export const VirtualImageGrid = ({
  images,
  itemsPerRow,
  itemHeight,
  containerHeight,
  onToggleActive,
  onDelete,
  deletingId,
  size = "small",
}: VirtualImageGridProps) => {
  const [scrollTop, setScrollTop] = useState(0);
  const scrollElementRef = useRef<HTMLDivElement>(null);

  // Calculate virtual list parameters
  const totalRows = Math.ceil(images.length / itemsPerRow);
  const totalHeight = totalRows * itemHeight;
  const visibleRows = Math.ceil(containerHeight / itemHeight);
  const startRow = Math.floor(scrollTop / itemHeight);
  const endRow = Math.min(startRow + visibleRows + 1, totalRows);

  // Get visible items
  const visibleItems = useMemo(() => {
    const items = [];
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      for (let colIndex = 0; colIndex < itemsPerRow; colIndex++) {
        const index = rowIndex * itemsPerRow + colIndex;
        if (index < images.length) {
          items.push({
            image: images[index],
            index,
            rowIndex,
            colIndex,
            top: rowIndex * itemHeight,
          });
        }
      }
    }
    return items;
  }, [images, startRow, endRow, itemsPerRow, itemHeight]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Only render if we have a reasonable number of images
  if (images.length < 50) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {images.map((image) => (
          <OptimizedImagePreview
            key={image.id}
            image={image}
            onToggle={() => onToggleActive(image.id)}
            onDelete={() => onDelete(image.id, image.imageName)}
            size={size}
            isDeleting={deletingId === image.id}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      ref={scrollElementRef}
      className="relative overflow-auto"
      style={{ height: containerHeight }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {visibleItems.map(({ image, index, top, colIndex }) =>
          image ? (
            <div
              key={image.id}
              className="absolute"
              style={{
                top,
                left: `${(colIndex / itemsPerRow) * 100}%`,
                width: `${100 / itemsPerRow}%`,
                height: itemHeight,
                padding: "8px",
              }}
            >
              <div className="w-full h-full">
                <OptimizedImagePreview
                  image={image}
                  onToggle={() => onToggleActive(image.id)}
                  onDelete={() => onDelete(image.id, image.imageName)}
                  size={size}
                  isDeleting={deletingId === image.id}
                />
              </div>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
};
