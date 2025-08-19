"use client";

import { Target, Trophy, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Target className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
            ELO Bierjunge
          </DialogTitle>
          <DialogDescription className="text-sm">
            Du hast eine BJ-Bestellung für <strong>{drinkName}</strong> gemacht.
            Wähle deinen Gegner und das Spielergebnis aus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 mt-4">
          {/* Opponent Selection */}
          <div className="space-y-2 sm:space-y-3">
            <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />
              Wähle deinen Gegner:
            </Label>
            <div className="max-h-32 sm:max-h-40 overflow-y-auto space-y-1 sm:space-y-2 border rounded-lg p-2">
              <RadioGroup
                value={selectedOpponent}
                onValueChange={setSelectedOpponent}
              >
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center space-x-2 sm:space-x-3 p-1.5 sm:p-2 rounded-lg hover:bg-muted/50 active:bg-muted/70 transition-colors"
                  >
                    <RadioGroupItem
                      value={user.id}
                      id={user.id}
                      className="h-4 w-4 sm:h-5 sm:w-5"
                    />
                    <Avatar className="h-6 w-6 sm:h-8 sm:w-8">
                      <AvatarImage src={user.image || undefined} />
                      <AvatarFallback className="text-[10px] sm:text-xs">
                        {(user.name || user.email)
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <Label htmlFor={user.id} className="flex-1 cursor-pointer">
                      <div className="font-medium text-sm sm:text-base truncate">
                        {user.name || "Unbekannt"}
                      </div>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>

          {/* Game Result Selection */}
          {selectedOpponent && (
            <div className="space-y-2 sm:space-y-3">
              <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                <Trophy className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="truncate">
                  Spielergebnis gegen{" "}
                  {selectedUser?.name || selectedUser?.email}:
                </span>
              </Label>
              <RadioGroup
                value={gameResult || ""}
                onValueChange={(value) =>
                  setGameResult(value as "won" | "lost")
                }
                className="space-y-2"
              >
                <div className="flex items-center space-x-2 p-2.5 sm:p-3 rounded-lg border-2 border-green-200 hover:border-green-300 active:border-green-400 transition-colors">
                  <RadioGroupItem
                    value="won"
                    id="won"
                    className="h-4 w-4 sm:h-5 sm:w-5"
                  />
                  <Label htmlFor="won" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />
                      <span className="font-medium text-green-700 text-sm sm:text-base">
                        Gewonnen
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-green-600 mt-0.5 sm:mt-1">
                      Du hast {selectedUser?.name || selectedUser?.email} an der
                      Tasse abgezogen!
                    </p>
                  </Label>
                </div>

                <div className="flex items-center space-x-2 p-2.5 sm:p-3 rounded-lg border-2 border-red-200 hover:border-red-300 active:border-red-400 transition-colors">
                  <RadioGroupItem
                    value="lost"
                    id="lost"
                    className="h-4 w-4 sm:h-5 sm:w-5"
                  />
                  <Label htmlFor="lost" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Target className="h-3 w-3 sm:h-4 sm:w-4 text-red-500" />
                      <span className="font-medium text-red-700 text-sm sm:text-base">
                        Niederlage
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-red-600 mt-0.5 sm:mt-1">
                      Nächstes Mal geht es schneller!
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4 sm:mt-6">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isPending}
            className="w-full sm:w-auto text-sm sm:text-base py-2 sm:py-2.5"
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedOpponent || !gameResult || isPending}
            className={`w-full sm:w-auto text-sm sm:text-base py-2 sm:py-2.5 ${
              gameResult === "won"
                ? "bg-green-500 hover:bg-green-600 active:bg-green-700"
                : "bg-orange-500 hover:bg-orange-600 active:bg-orange-700"
            }`}
          >
            {isPending ? "Speichere..." : "Bestätigen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
