// ~/components/profile/GamificationPreferences.tsx
"use client";

import { Gamepad, ShieldOff } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import {
  getEloPreferenceAction,
  setEloPreferenceAction,
} from "~/server/actions/profile/preferences";

export function Preferences() {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    (async () => {
      const res = await getEloPreferenceAction();
      setEnabled(res?.enabled ?? true);
    })();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gamepad className="h-5 w-5" />
          Privatsphäre & Präferenzen
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Eloranking</p>
            <p className="text-sm text-muted-foreground">
              Teilnahme an Bierjungen & Rangliste
            </p>
          </div>
          <Badge variant={enabled ? "default" : "secondary"}>
            {enabled ? "Aktiv" : "Deaktiviert"}
          </Badge>
        </div>
        <Separator />
        <Button
          variant={enabled ? "outline" : "default"}
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const next = !enabled;
              const ok = await setEloPreferenceAction({ enabled: next });
              if (ok) {
                setEnabled(next);
                toast.success(
                  next ? "Eloranking aktiviert" : "Eloranking deaktiviert"
                );
              } else {
                toast.error("Aktion fehlgeschlagen");
              }
            })
          }
          className="w-full"
        >
          <ShieldOff className="mr-2 h-4 w-4" />
          {enabled ? "Eloranking deaktivieren" : "Eloranking wieder aktivieren"}
        </Button>
      </CardContent>
    </Card>
  );
}
