"use client";

import { Target, Trophy, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";

interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

interface GameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  drinkName: string;
  onGameResult: (opponentId: string, won: boolean) => void;
}

export function GameDialog({
  isOpen,
  onClose,
  users,
  drinkName,
  onGameResult,
}: GameDialogProps) {
  const [selectedOpponent, setSelectedOpponent] = useState<string>("");
  const [gameResult, setGameResult] = useState<"won" | "lost" | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleConfirm = () => {
    if (!selectedOpponent || !gameResult) {
      toast.error("Bitte wähle einen Gegner und das Spielergebnis aus.");
      return;
    }

    startTransition(async () => {
      try {
        await onGameResult(selectedOpponent, gameResult === "won");
        handleClose();
      } catch (error) {
        console.error("Game result error:", error);
        toast.error(
          "Ein Fehler ist beim Speichern des Spielergebnisses aufgetreten."
        );
      }
    });
  };

  const handleClose = () => {
    onClose();
    setSelectedOpponent("");
    setGameResult(null);
  };

  const selectedUser = users.find((user) => user.id === selectedOpponent);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-orange-500" />
            ELO Bierjunge
          </DialogTitle>
          <DialogDescription>
            Du hast eine BJ-Bestellung für <strong>{drinkName}</strong> gemacht.
            Wähle deinen Gegner und das Spielergebnis aus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Opponent Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Wähle deinen Gegner:
            </Label>
            <div className="max-h-40 overflow-y-auto space-y-2">
              <RadioGroup
                value={selectedOpponent}
                onValueChange={setSelectedOpponent}
              >
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50"
                  >
                    <RadioGroupItem value={user.id} id={user.id} />
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.image || undefined} />
                      <AvatarFallback className="text-xs">
                        {(user.name || user.email)
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <Label htmlFor={user.id} className="flex-1 cursor-pointer">
                      <div className="font-medium">
                        {user.name || "Unbekannt"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {user.email}
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>

          {/* Game Result Selection */}
          {selectedOpponent && (
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Spielergebnis gegen {selectedUser?.name || selectedUser?.email}:
              </Label>
              <RadioGroup
                value={gameResult || ""}
                onValueChange={(value) =>
                  setGameResult(value as "won" | "lost")
                }
              >
                <div className="flex items-center space-x-2 p-3 rounded-lg border-2 border-green-200 hover:border-green-300">
                  <RadioGroupItem value="won" id="won" />
                  <Label htmlFor="won" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-green-500" />
                      <span className="font-medium text-green-700">
                        Gewonnen! 🎉
                      </span>
                    </div>
                    <p className="text-xs text-green-600 mt-1">
                      Du hast an der Tasse gewonnen und deine ELO steigt!
                    </p>
                  </Label>
                </div>

                <div className="flex items-center space-x-2 p-3 rounded-lg border-2 border-red-200 hover:border-red-300">
                  <RadioGroupItem value="lost" id="lost" />
                  <Label htmlFor="lost" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-red-500" />
                      <span className="font-medium text-red-700">
                        Verloren 😅
                      </span>
                    </div>
                    <p className="text-xs text-red-600 mt-1">
                      Nächstes Mal geht es schneller!
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Summary */}
          {selectedOpponent && gameResult && (
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              <h4 className="font-medium text-sm">Zusammenfassung:</h4>
              <div className="flex items-center gap-2 text-sm">
                <Badge
                  variant={gameResult === "won" ? "default" : "destructive"}
                >
                  {gameResult === "won" ? "Sieg" : "Niederlage"}
                </Badge>
                <span>gegen</span>
                <strong>{selectedUser?.name || selectedUser?.email}</strong>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isPending}>
            Abbrechen
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedOpponent || !gameResult || isPending}
            className={
              gameResult === "won"
                ? "bg-green-500 hover:bg-green-600"
                : "bg-orange-500 hover:bg-orange-600"
            }
          >
            {isPending ? "Speichere..." : "Bestätigen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
