import { Coffee } from "lucide-react";

export function EmptyState() {
  return (
    <div className="text-center py-12">
      <Coffee className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">Keine Getränke verfügbar</h3>
      <p className="text-muted-foreground">
        Unsere Getränkekarte wird bald aktualisiert.
      </p>
    </div>
  );
}
