import { Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { getRecentGames } from "~/server/actions/game/game";
import { RecentGamesClient } from "./RecentGamesClient";

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

  return <RecentGamesClient games={recentGames} />;
}
