import { Coffee } from "lucide-react";

export function LoadingState() {
  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Coffee className="h-6 w-6 animate-pulse" />
          <div>Getränkekarte wird geladen...</div>
        </div>
      </div>
    </div>
  );
}
