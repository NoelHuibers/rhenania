import { Plus } from "lucide-react";

import { Button } from "~/components/ui/button";

export function Header({
  count,
  onAdd,
  isPending,
}: {
  count: number;
  onAdd: () => void;
  isPending: boolean;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-center">
            Verwalten Sie Ihre Getränkekarte, Preise und Verfügbarkeit
          </p>
          <p className="sr-only" aria-live="polite">
            {count} Getränke vorhanden
          </p>
        </div>
        <div className="hidden md:block">
          <Button
            onClick={onAdd}
            disabled={isPending}
            aria-label="Getränk hinzufügen"
          >
            <Plus className="mr-2 h-4 w-4" />
            Getränk hinzufügen
          </Button>
        </div>
      </div>
    </>
  );
}
