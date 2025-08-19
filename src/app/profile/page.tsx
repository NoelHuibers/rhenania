import { AccountSecurity } from "~/components/profile/AccountSecurity";
import { BillingOverview } from "~/components/profile/BillingOverview";
import { GamesElo } from "~/components/profile/games-elo";
import { ProfileIdentity } from "~/components/profile/profile-identity";
import { RecentOrders } from "~/components/profile/recent-orders";
import { SidebarLayout } from "~/components/sidebar/sidebar-layout";
import { SiteHeader } from "~/components/trinken/SiteHeader";

export default function ProfilePage() {
  return (
    <SidebarLayout>
      <SiteHeader title="Profile Dashboard" />
      <div className="flex-1 bg-background p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <ProfileIdentity />
              <AccountSecurity />
            </div>
            <div className="lg:col-span-2 space-y-6">
              <BillingOverview />
              <RecentOrders />
              <GamesElo />
            </div>
          </div>
        </div>
      </div>
    </SidebarLayout>
  );
}
