// components/bilder/UploadProgress.tsx
"use client";

import { Progress } from "~/components/ui/progress";
import type { HomepageSection } from "~/server/actions/bilder/homepageImages";

interface UploadProgressProps {
  uploading: HomepageSection | null;
  uploadProgress: number;
}

export const UploadProgress = ({
  uploading,
  uploadProgress,
}: UploadProgressProps) => {
  if (!uploading) return null;

  return (
    <div className="fixed top-4 right-4 bg-background border rounded-lg p-4 shadow-lg z-50 min-w-[300px]">
      <p className="text-sm font-medium mb-2">
        Lade {uploading} Bilder hoch...
      </p>
      <Progress value={uploadProgress} className="h-2" />
      <p className="text-xs text-muted-foreground mt-1">{uploadProgress}%</p>
    </div>
  );
};
