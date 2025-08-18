import { Clock, TrendingDown, TrendingUp } from "lucide-react";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { getRecentGames } from "~/server/actions/game";

export async function RecentGamesSection() {
  let recentGames;
  try {
    recentGames = await getRecentGames(15);
  } catch (error) {
    console.error("Failed to load recent games:", error);
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Games
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <p>Unable to load recent games.</p>
            <p className="text-sm mt-2">
              Please check your database connection.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!recentGames || recentGames.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Games
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <p>No recent games found.</p>
            <p className="text-sm mt-2">Play some games to see them here!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor(
      (now.getTime() - timestamp.getTime()) / (1000 * 60)
    );

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
          {recentGames.map((game) => {
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
                    {formatTimeAgo(new Date(game.playedAt))}
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
                        <AvatarFallback className="text-xs">
                          {game.player1Name?.charAt(0).toUpperCase() || "?"}
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
                        <AvatarFallback className="text-xs">
                          {game.player2Name?.charAt(0).toUpperCase() || "?"}
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
