// components/bilder/DropZone.tsx
"use client";

import { useCallback, useState } from "react";
import type { HomepageSection } from "~/server/actions/bilder/homepageImages";

export interface DropZoneProps {
  section: HomepageSection;
  inputRef: React.RefObject<HTMLInputElement | null>;
  children: React.ReactNode;
  className?: string;
  onFileSelect: (files: FileList | null, section: HomepageSection) => void;
  uploading: HomepageSection | null;
}

export const DropZone = ({
  section,
  inputRef,
  children,
  className = "",
  onFileSelect,
  uploading,
}: DropZoneProps) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      onFileSelect(e.dataTransfer.files, section);
    },
    [onFileSelect, section]
  );

  const handleClick = useCallback(() => {
    if (!uploading) {
      inputRef.current?.click();
    }
  }, [uploading, inputRef]);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFileSelect(e.target.files, section);
    },
    [onFileSelect, section]
  );

  return (
    <div
      className={`relative border-2 border-dashed rounded-lg transition-all cursor-pointer
        ${
          isDragging
            ? "border-primary bg-primary/5 scale-105"
            : "border-border hover:border-primary/50 hover:bg-accent/5"
        }
        ${uploading === section ? "opacity-50 pointer-events-none" : ""}
        ${className}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={section === "aktive" || section === "haus"}
        className="hidden"
        onChange={handleFileInputChange}
        disabled={uploading === section}
      />
      {children}
    </div>
  );
};
