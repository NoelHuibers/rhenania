// components/bilder/DraggableImageGrid.tsx
"use client";

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Loader2, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "~/components/ui/button";
import type { ImageItem } from "./OptimizedImagePreview";

interface SortableImageItemProps {
  image: ImageItem;
  onToggleActive: (imageId: string) => void;
  onDelete: (imageId: string, imageName: string) => void;
  deletingId: string | null;
  size: "small" | "medium" | "large";
}

const SortableImageItem = ({
  image,
  onToggleActive,
  onDelete,
  deletingId,
  size,
}: SortableImageItemProps) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sizeClasses = {
    small: "w-32 h-32",
    medium: "w-48 h-48",
    large: "w-full h-64",
  };

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onDelete(image.id, image.imageName);
    },
    [onDelete, image.id, image.imageName]
  );

  const handleToggleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onToggleActive(image.id);
    },
    [onToggleActive, image.id]
  );

  const isDeleting = deletingId === image.id;

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <div
        {...attributes}
        {...listeners}
        className={`relative group ${
          sizeClasses[size]
        } rounded-lg overflow-hidden border-2 transition-all cursor-move
        ${
          image.isActive
            ? "border-green-500 shadow-lg"
            : "border-border opacity-75"
        }
        ${isDeleting ? "opacity-50 scale-95" : ""}
        ${isDragging ? "cursor-grabbing z-50" : "cursor-grab"}`}
        onClick={handleToggleClick}
      >
        {/* Image with loading states */}
        <div className="relative w-full h-full bg-gray-100 pointer-events-none">
          {!imageLoaded && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}

          {imageError ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
              <span className="text-gray-500 text-sm">Fehler beim Laden</span>
            </div>
          ) : (
            <img
              src={image.imageUrl}
              alt={image.imageName}
              className={`w-full h-full object-cover transition-opacity ${
                imageLoaded ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              loading="lazy"
              draggable={false}
            />
          )}
        </div>

        {/* Status badge */}
        <div
          className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium pointer-events-none
          ${
            image.isActive
              ? "bg-green-500 text-white"
              : "bg-gray-500 text-white"
          }`}
        >
          {image.isActive ? "Aktiv" : "Inaktiv"}
        </div>

        {/* Delete button - Always visible on hover */}
        <Button
          size="icon"
          variant="destructive"
          onClick={handleDeleteClick}
          disabled={isDeleting}
          className="absolute bottom-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-auto"
        >
          {isDeleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </Button>

        {/* Image name */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pointer-events-none">
          <p className="text-white text-xs truncate">{image.imageName}</p>
        </div>
      </div>
    </div>
  );
};

interface DraggableImageGridProps {
  images: ImageItem[];
  onToggleActive: (imageId: string) => void;
  onDelete: (imageId: string, imageName: string) => void;
  onReorder: (imageIds: string[]) => void;
  deletingId: string | null;
  size: "small" | "medium" | "large";
  allowMultiple: boolean;
}

export const DraggableImageGrid = ({
  images,
  onToggleActive,
  onDelete,
  onReorder,
  deletingId,
  size,
  allowMultiple,
}: DraggableImageGridProps) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      // Require mouse to move 10 pixels before activating drag
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      // Require touch to move 10 pixels before activating drag
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback((event: any) => {
    setActiveId(event.active.id);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = images.findIndex((item) => item.id === active.id);
        const newIndex = images.findIndex((item) => item.id === over.id);

        const reorderedImages = arrayMove(images, oldIndex, newIndex);
        const reorderedIds = reorderedImages.map((img) => img.id);

        onReorder(reorderedIds);
      }

      setActiveId(null);
    },
    [images, onReorder]
  );

  const gridClasses = allowMultiple
    ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
    : "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6";

  const activeImage = activeId
    ? images.find((img) => img.id === activeId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={images.map((img) => img.id)}
        strategy={rectSortingStrategy}
      >
        <div className={gridClasses}>
          {images.map((image) => (
            <SortableImageItem
              key={image.id}
              image={image}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
              deletingId={deletingId}
              size={size}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay>
        {activeImage ? (
          <div className="opacity-80 cursor-grabbing">
            <div
              className={`relative ${
                size === "small"
                  ? "w-32 h-32"
                  : size === "medium"
                  ? "w-48 h-48"
                  : "w-full h-64"
              } rounded-lg overflow-hidden border-2 shadow-xl
              ${activeImage.isActive ? "border-green-500" : "border-border"}`}
            >
              <img
                src={activeImage.imageUrl}
                alt={activeImage.imageName}
                className="w-full h-full object-cover"
                draggable={false}
              />
              <div
                className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium
                ${
                  activeImage.isActive
                    ? "bg-green-500 text-white"
                    : "bg-gray-500 text-white"
                }`}
              >
                {activeImage.isActive ? "Aktiv" : "Inaktiv"}
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
