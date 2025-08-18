import { SidebarLayout } from "~/components/sidebar/sidebar-layout";
import LeaderboardPage from "~/components/trinken/leaderboard/LeaderboardPage";

export default function Page() {
  return (
    <SidebarLayout>
      <LeaderboardPage />
    </SidebarLayout>
  );
}
