import { Target, TrendingUp, Trophy } from "lucide-react";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { getLeaderboard } from "~/server/actions/game";

export async function LeaderboardSection() {
  let leaderboard;
  try {
    leaderboard = await getLeaderboard(20);
  } catch (error) {
    console.error("Failed to load leaderboard:", error);
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
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
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
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
    if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Trophy className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Trophy className="h-5 w-5 text-amber-600" />;
    return (
      <span className="text-sm font-medium text-muted-foreground">#{rank}</span>
    );
  };

  const getEloColor = (elo: number) => {
    if (elo >= 1600) return "text-purple-500";
    if (elo >= 1400) return "text-blue-500";
    if (elo >= 1200) return "text-green-500";
    return "text-gray-500";
  };

  const getEloRank = (elo: number) => {
    if (elo >= 1800) return "Grandmaster";
    if (elo >= 1600) return "Master";
    if (elo >= 1400) return "Expert";
    if (elo >= 1200) return "Advanced";
    if (elo >= 1000) return "Intermediate";
    return "Beginner";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          ELO Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {leaderboard.map((player, index) => {
            const rank = index + 1;
            const winRate = player.winRate;
            const isPeakElo = player.currentElo === player.peakElo;

            return (
              <div
                key={player.userId}
                className={`flex items-center justify-between p-4 rounded-lg border transition-colors hover:bg-muted/50 ${
                  rank <= 3 ? "bg-muted/30" : ""
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-8">
                    {getRankIcon(rank)}
                  </div>

                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {player.userName?.charAt(0).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">
                        {player.userName || "Unknown Player"}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {getEloRank(player.currentElo)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{player.totalGames} games</span>
                      <span>
                        {player.wins}W-{player.losses}L
                      </span>
                      <span>{winRate.toFixed(1)}% WR</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div
                      className={`text-2xl font-bold ${getEloColor(
                        player.currentElo
                      )}`}
                    >
                      {player.currentElo}
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <TrendingUp className="h-3 w-3" />
                      <span>Peak: {player.peakElo}</span>
                      {isPeakElo && (
                        <Target className="h-3 w-3 text-green-500" />
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
