"use client";

import { Clock, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { GameRecord } from "~/server/actions/game/game";

interface RecentGamesClientProps {
  games: GameRecord[];
}

export function RecentGamesClient({ games }: RecentGamesClientProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Update immediately on mount
    setCurrentTime(new Date());

    // Update every minute
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const formatTimeAgo = (timestamp: Date | string) => {
    const gameDate =
      typeof timestamp === "string" ? new Date(timestamp) : timestamp;
    const diffInMinutes = Math.floor(
      (currentTime.getTime() - gameDate.getTime()) / (1000 * 60)
    );

    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Recent Games
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {games.map((game) => {
            const player1Won = game.winnerId === game.player1Id;
            const player1EloChange =
              game.player1EloAfter - game.player1EloBefore;
            const player2EloChange =
              game.player2EloAfter - game.player2EloBefore;

            return (
              <div key={game.id} className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="outline" className="text-xs">
                    {game.gameType}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatTimeAgo(game.playedAt)}
                  </span>
                </div>

                <div className="space-y-3">
                  {/* Player 1 */}
                  <div
                    className={`flex items-center justify-between p-2 rounded ${
                      player1Won
                        ? "bg-green-50 dark:bg-green-950/20"
                        : "bg-red-50 dark:bg-red-950/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={game.player1Avatar || "/placeholder.svg"}
                          alt={game.player1Name || "Player Avatar"}
                        />
                        <AvatarFallback>
                          {(game.player1Name || "Unknown Player")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm">
                          {game.player1Name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {game.player1EloBefore} → {game.player1EloAfter}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {player1Won && (
                        <Badge className="text-xs bg-green-500">WIN</Badge>
                      )}
                      <div
                        className={`flex items-center gap-1 text-sm font-medium ${
                          player1EloChange > 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {player1EloChange > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {Math.abs(player1EloChange)}
                      </div>
                    </div>
                  </div>

                  {/* VS Divider */}
                  <div className="text-center text-xs text-muted-foreground font-medium">
                    VS
                  </div>

                  {/* Player 2 */}
                  <div
                    className={`flex items-center justify-between p-2 rounded ${
                      !player1Won
                        ? "bg-green-50 dark:bg-green-950/20"
                        : "bg-red-50 dark:bg-red-950/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={game.player2Avatar || "/placeholder.svg"}
                          alt={game.player2Name || "Player Avatar"}
                        />
                        <AvatarFallback>
                          {(game.player2Name || "Unknown Player")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm">
                          {game.player2Name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {game.player2EloBefore} → {game.player2EloAfter}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!player1Won && (
                        <Badge className="text-xs bg-green-500">WIN</Badge>
                      )}
                      <div
                        className={`flex items-center gap-1 text-sm font-medium ${
                          player2EloChange > 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {player2EloChange > 0 ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {Math.abs(player2EloChange)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
