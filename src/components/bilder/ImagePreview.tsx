// components/bilder/ImagePreview.tsx
"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useCallback } from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import type { HomepageSection } from "~/server/actions/bilder/homepageImages";

export interface ImageItem {
  id: string;
  imageUrl: string;
  imageName: string;
  section: HomepageSection;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
}

export interface ImagePreviewProps {
  image: ImageItem;
  onToggle: () => void;
  onDelete: () => void;
  size?: "small" | "medium" | "large";
  isDeleting: boolean;
}

export const ImagePreview = ({
  image,
  onToggle,
  onDelete,
  size = "medium",
  isDeleting,
}: ImagePreviewProps) => {
  const sizeClasses = {
    small: "w-32 h-32",
    medium: "w-48 h-48",
    large: "w-full h-64",
  };

  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete();
    },
    [onDelete]
  );

  return (
    <div
      className={`relative group ${
        sizeClasses[size]
      } rounded-lg overflow-hidden border-2 transition-all
        ${
          image.isActive
            ? "border-green-500 shadow-lg"
            : "border-border opacity-75"
        }
        ${isDeleting ? "opacity-50 scale-95" : ""}`}
    >
      <img
        src={image.imageUrl}
        alt={image.imageName}
        className="w-full h-full object-cover"
      />

      {/* Status badge */}
      <div
        className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium
        ${
          image.isActive ? "bg-green-500 text-white" : "bg-gray-500 text-white"
        }`}
      >
        {image.isActive ? "Aktiv" : "Inaktiv"}
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
        <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2">
          <Label
            htmlFor={`active-${image.id}`}
            className="text-white text-sm cursor-pointer"
          >
            {image.isActive ? "Deaktivieren" : "Aktivieren"}
          </Label>
          <Switch
            id={`active-${image.id}`}
            checked={image.isActive}
            onCheckedChange={onToggle}
            disabled={isDeleting}
          />
        </div>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDeleteClick}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          <span className="ml-2">Löschen</span>
        </Button>
      </div>

      {/* Image name */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <p className="text-white text-xs truncate">{image.imageName}</p>
      </div>
    </div>
  );
};
