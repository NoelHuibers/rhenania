import { Target, TrendingUp, Trophy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { getLeaderboard } from "~/server/actions/game/game";

export async function LeaderboardSection() {
  let leaderboard;
  try {
    leaderboard = await getLeaderboard(20);
  } catch (error) {
    console.error("Failed to load leaderboard:", error);
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Trophy className="h-4 w-4 sm:h-5 sm:w-5" />
            ELO Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <p>Unable to load leaderboard data.</p>
            <p className="text-sm mt-2">
              Please check your database connection.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!leaderboard || leaderboard.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Trophy className="h-4 w-4 sm:h-5 sm:w-5" />
            ELO Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-8">
            <p>No players found.</p>
            <p className="text-sm mt-2">
              Start playing some games to see the leaderboard!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1)
      return <Trophy className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-500" />;
    if (rank === 2)
      return <Trophy className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400" />;
    if (rank === 3)
      return <Trophy className="h-3 w-3 sm:h-4 sm:w-4 text-amber-600" />;
    return (
      <span className="text-xs font-medium text-muted-foreground">#{rank}</span>
    );
  };

  const getEloColor = (elo: number) => {
    if (elo >= 1600) return "text-purple-500";
    if (elo >= 1400) return "text-blue-500";
    if (elo >= 1200) return "text-green-500";
    return "text-gray-500";
  };

  const getEloRank = (elo: number) => {
    if (elo >= 1800) return "GM";
    if (elo >= 1600) return "M";
    if (elo >= 1400) return "E";
    if (elo >= 1200) return "A";
    if (elo >= 1000) return "I";
    return "B";
  };

  return (
    <Card>
      <CardHeader className="pb-3 sm:pb-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Trophy className="h-4 w-4 sm:h-5 sm:w-5" />
          ELO Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="space-y-2 sm:space-y-3">
          {leaderboard.map((player, index) => {
            const rank = index + 1;
            const winRate = player.winRate;
            const isPeakElo = player.currentElo === player.peakElo;

            return (
              <div
                key={player.userId}
                className={`flex items-center justify-between p-2 sm:p-3 rounded-lg border transition-colors hover:bg-muted/50 ${
                  rank <= 3 ? "bg-muted/30" : ""
                }`}
              >
                {/* Left side: Rank + Avatar + Name */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  {/* Rank - Very compact */}
                  <div className="flex items-center justify-center w-5 sm:w-6">
                    {getRankIcon(rank)}
                  </div>

                  <Avatar className="h-8 w-8">
                    <AvatarImage
                      src={player.avatar || "/placeholder.svg"}
                      alt={player.userName || "Player Avatar"}
                    />
                    <AvatarFallback>
                      {(player.userName || "Unknown Player")
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>

                  {/* Player Name - Truncate if needed */}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs sm:text-sm font-medium">
                      {player.userName || "Unknown"}
                    </div>
                    {/* Ultra compact stats - mobile only */}
                    <div className="text-[10px] sm:text-xs text-muted-foreground sm:hidden">
                      {player.wins}-{player.losses} • {winRate.toFixed(0)}%
                    </div>
                    {/* Desktop stats */}
                    <div className="hidden sm:block text-xs text-muted-foreground">
                      {player.totalGames} games • {player.wins}W-{player.losses}
                      L • {winRate.toFixed(1)}% WR
                    </div>
                  </div>
                </div>

                {/* Right side: Badge + ELO */}
                <div className="flex items-center gap-1 sm:gap-3">
                  {/* ELO Score */}
                  <div className="text-right">
                    <div
                      className={`text-sm sm:text-lg font-bold ${getEloColor(
                        player.currentElo
                      )}`}
                    >
                      {player.currentElo}
                    </div>
                    {/* Peak ELO - now visible on both mobile and desktop */}
                    <div className="flex items-center gap-0.5 sm:gap-1 text-[10px] sm:text-xs text-muted-foreground">
                      <TrendingUp className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                      <span className="sm:hidden">{player.peakElo}</span>
                      <span className="hidden sm:inline">
                        Peak: {player.peakElo}
                      </span>
                      {isPeakElo && (
                        <Target className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-500" />
                      )}
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
