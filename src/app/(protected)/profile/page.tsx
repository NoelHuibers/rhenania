import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AchievementsSkeleton } from "~/components/profile/Achievements";
import { BillingOverviewSkeleton } from "~/components/profile/BillingOverview";
import { FuchsenBillingOverviewSkeleton } from "~/components/profile/FuchsenBillingOverview";
import { GamesEloContainerDetailed } from "~/components/profile/GamesEloContainer";
import { MemberAddressCard } from "~/components/profile/MemberAddressCard";
import { OpenBillSection } from "~/components/profile/OpenBillSection";
import { PaymentInfo } from "~/components/profile/PaymentInfo";
import { ProfileIdentitySkeleton } from "~/components/profile/ProfileCard";
import {
	AccountSecuritySection,
	AchievementsSection,
	BillingOverviewSection,
	FuchsenBillingSection,
	IdentitySection,
	MemberAddressSection,
	PaymentInfoSection,
	PreferencesSection,
	RecentOrdersSection,
	SectionSkeleton,
} from "~/components/profile/ProfileSections";
import { RecentOrdersSkeleton } from "~/components/profile/RecentOrders";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { auth } from "~/server/auth";

// Every card loads its data on the server inside its own Suspense boundary
// (#24): the cards load in parallel and stream in as they finish.
export default async function ProfilePage() {
	const session = await auth();
	if (!session?.user?.id) {
		redirect("/auth/signin");
	}
	const userId = session.user.id;

	return (
		<>
			<SiteHeader title="Nutzerprofil" />
			<div className="flex-1 bg-background p-4 md:p-6">
				<div className="mx-auto max-w-7xl">
					{/* On a phone the open bill comes before the account cards (#80);
					    on desktop BillingOverview already heads the right column. */}
					<Suspense fallback={null}>
						<OpenBillSection className="mb-6 lg:hidden" />
					</Suspense>
					<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
						<div className="space-y-6 lg:col-span-1">
							<Suspense fallback={<ProfileIdentitySkeleton />}>
								<IdentitySection />
							</Suspense>
							<Suspense fallback={<SectionSkeleton />}>
								<AccountSecuritySection />
							</Suspense>
							<Suspense fallback={<SectionSkeleton />}>
								<PreferencesSection userId={userId} />
							</Suspense>
							<Suspense fallback={<PaymentInfo />}>
								<PaymentInfoSection />
							</Suspense>
							<Suspense fallback={<MemberAddressCard />}>
								<MemberAddressSection />
							</Suspense>
						</div>
						<div className="space-y-6 lg:col-span-2">
							<Suspense fallback={<BillingOverviewSkeleton />}>
								<BillingOverviewSection />
							</Suspense>
							<Suspense fallback={<FuchsenBillingOverviewSkeleton />}>
								<FuchsenBillingSection />
							</Suspense>
							<Suspense fallback={<RecentOrdersSkeleton />}>
								<RecentOrdersSection />
							</Suspense>
							<Suspense fallback={<SectionSkeleton />}>
								<GamesEloContainerDetailed />
							</Suspense>
							<Suspense fallback={<AchievementsSkeleton />}>
								<AchievementsSection />
							</Suspense>
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
