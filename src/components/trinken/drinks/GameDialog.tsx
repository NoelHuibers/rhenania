"use client";

import { Search, Target, Trophy, Users } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";

interface User {
  id: string;
  name: string | null;
  email: string | null;
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
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;

    const query = searchQuery.toLowerCase().trim();
    return users.filter((user) => {
      const name = (user.name || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [users, searchQuery]);

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
    setSearchQuery("");
  };

  const selectedUser = users.find((user) => user.id === selectedOpponent);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg md:max-w-xl lg:max-w-2xl w-[95vw] max-h-[85vh] sm:max-h-[75vh] md:max-h-[70vh] flex flex-col p-4 sm:p-6 overflow-hidden">
        <DialogHeader className="flex-shrink-0 space-y-2">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Target className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500" />
            ELO Bierjunge
          </DialogTitle>
          <DialogDescription className="text-sm">
            Du hast eine BJ-Bestellung für <strong>{drinkName}</strong> gemacht.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 sm:space-y-6 mt-4 pr-1">
          {/* Opponent Selection */}
          <div className="space-y-2 sm:space-y-3">
            <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />
              Wähle deinen Gegner:
            </Label>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Nach Namen suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 sm:pl-9 text-sm h-8 sm:h-9"
              />
            </div>

            <div className="max-h-48 sm:max-h-64 overflow-y-auto space-y-1 sm:space-y-2 border rounded-lg p-2">
              {filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {searchQuery.trim()
                    ? "Keine Benutzer gefunden"
                    : "Keine Benutzer verfügbar"}
                </div>
              ) : (
                <RadioGroup
                  value={selectedOpponent}
                  onValueChange={setSelectedOpponent}
                >
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center space-x-2 sm:space-x-3 p-1.5 sm:p-2 rounded-lg hover:bg-muted/50 active:bg-muted/70 transition-colors"
                    >
                      <RadioGroupItem
                        value={user.id}
                        id={user.id}
                        className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0"
                      />
                      <Avatar className="h-6 w-6 sm:h-8 sm:w-8 flex-shrink-0">
                        <AvatarImage src={user.image || undefined} />
                        <AvatarFallback className="text-[10px] sm:text-xs">
                          {(user.name || user.email || "")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <Label
                        htmlFor={user.id}
                        className="flex-1 cursor-pointer min-w-0"
                      >
                        <div className="font-medium text-sm sm:text-base truncate">
                          {user.name || "Unbekannt"}
                        </div>
                        {/* Only show email on desktop */}
                        {user.email && user.name && (
                          <div className="hidden sm:block text-[10px] sm:text-xs text-muted-foreground truncate">
                            {user.email}
                          </div>
                        )}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            </div>
          </div>

          {/* Game Result Selection */}
          {selectedOpponent && (
            <div className="space-y-2 sm:space-y-3 flex-shrink-0">
              <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
                <Trophy className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
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
                    className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0"
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
                    className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0"
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

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4 sm:mt-6 flex-shrink-0">
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
