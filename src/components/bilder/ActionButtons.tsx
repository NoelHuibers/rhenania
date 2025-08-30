// components/bilder/ActionButtons.tsx
"use client";

import { Eye } from "lucide-react";
import { useCallback } from "react";
import { Button } from "~/components/ui/button";

interface ActionButtonsProps {
  loading: boolean;
  onRefresh: () => void;
}

export const ActionButtons = ({ loading, onRefresh }: ActionButtonsProps) => {
  const handleViewHomepage = useCallback(() => {
    window.open("/", "_blank");
  }, []);

  return (
    <div className="flex justify-center gap-4">
      <Button size="lg" className="px-8" onClick={handleViewHomepage}>
        <Eye className="w-4 h-4 mr-2" />
        Homepage ansehen
      </Button>
    </div>
  );
};
