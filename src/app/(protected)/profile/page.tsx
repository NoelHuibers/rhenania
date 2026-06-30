import { AccountSecurity } from "~/components/profile/AccountSecurity";
import { Achievements } from "~/components/profile/Achievements";
import { BillingOverview } from "~/components/profile/BillingOverview";
import { FuchsenBillingOverview } from "~/components/profile/FuchsenBillingOverview";
import GamesEloContainerDetailed from "~/components/profile/GamesEloContainer";
import { MemberAddressCard } from "~/components/profile/MemberAddressCard";
import { PaymentInfo } from "~/components/profile/PaymentInfo";
import { Preferences } from "~/components/profile/Preferences";
import { ProfileIdentity } from "~/components/profile/ProfileCard";
import { RecentOrders } from "~/components/profile/RecentOrders";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { SiteHeader } from "~/components/trinken/SiteHeader";

export default function ProfilePage() {
	return (
		<SidebarLayout>
			<SiteHeader title="Nutzerprofil" />
			<div className="flex-1 bg-background p-4 md:p-6">
				<div className="mx-auto max-w-7xl">
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
						<div className="space-y-6 lg:col-span-1">
							<ProfileIdentity />
							<AccountSecurity />
							<Preferences />
							<PaymentInfo />
							<MemberAddressCard />
						</div>
						<div className="space-y-6 lg:col-span-2">
							<BillingOverview />
							<FuchsenBillingOverview />
							<RecentOrders />
							<GamesEloContainerDetailed />
							<Achievements />
						</div>
					</div>
				</div>
			</div>
		</SidebarLayout>
	);
}
