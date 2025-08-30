// components/bilder/LoadingSpinner.tsx
"use client";

import { Loader2 } from "lucide-react";

export const LoadingSpinner = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Lade Bilder...</p>
      </div>
    </div>
  );
};
