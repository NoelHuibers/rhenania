import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import LeaderboardPage from "~/components/trinken/leaderboard/LeaderboardPage";

export default function Page() {
  return (
    <SidebarLayout>
      <LeaderboardPage />
    </SidebarLayout>
  );
}
