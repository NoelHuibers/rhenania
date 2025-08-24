// EloDisabledCard.tsx
"use client";

import { Undo2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { setEloPreferenceAction } from "~/server/actions/profile/preferences";

export default function EloDisabledCard() {
  const [isPending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spiele & Elo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Du nimmst aktuell nicht am Elo-Ranking teil. Deine Spiele werden nicht
          gewertet und dein Rang ist ausgeblendet.
        </p>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const res = await setEloPreferenceAction({ enabled: true });
              if ("success" in res && res.success) {
                toast.success("Elo wieder aktiviert");
                window.location.reload();
              } else {
                toast.error("Aktion fehlgeschlagen");
              }
            })
          }
        >
          <Undo2 className="mr-2 h-4 w-4" />
          Ranking reaktivieren
        </Button>
      </CardContent>
    </Card>
  );
}
