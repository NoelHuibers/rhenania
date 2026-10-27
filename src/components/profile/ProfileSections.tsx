// Server sections of /profile (#24). Each one loads its own data on the
// server and hands it to a client component that only handles interaction.
// The page wraps every section in its own Suspense boundary, so they load in
// parallel and stream in as they finish; the browser makes no server-action
// calls on mount.

import { unstable_rethrow } from "next/navigation";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { getMyPaymentInfo } from "~/server/actions/cc-kasse/paymentInfo";
import {
	getMyFuchsenOrders,
	getMyFuchsenSummary,
} from "~/server/actions/fuchsenladen/orders";
import { getMyMember } from "~/server/actions/members/myMember";
import { getMyOrdersPage } from "~/server/actions/orders";
import { getUserAchievements } from "~/server/actions/profile/achievements";
import { getConnectedAccountsAction } from "~/server/actions/profile/auth";
import { getUserBillingData } from "~/server/actions/profile/getUserBill";
import { getUserProfile } from "~/server/actions/profile/profile";
import { getProfilePreferencesForUser } from "~/server/lib/preferences";
import { AccountSecurity } from "./AccountSecurity";
import { Achievements } from "./Achievements";
import { BillingOverview } from "./BillingOverview";
import { FuchsenBillingOverview } from "./FuchsenBillingOverview";
import { MemberAddressCard } from "./MemberAddressCard";
import { PaymentInfo } from "./PaymentInfo";
import { Preferences } from "./Preferences";
import { ProfileIdentity } from "./ProfileCard";
import { RecentOrders } from "./RecentOrders";

type Loaded<T> = { ok: true; value: T } | { ok: false; message: string };

/** Runs a section's loader; a failure is logged and shown in that section only. */
async function load<T>(what: string, loader: () => Promise<T>) {
	try {
		return { ok: true, value: await loader() } satisfies Loaded<T>;
	} catch (error) {
		unstable_rethrow(error);
		console.error(`Error loading ${what}:`, error);
		return {
			ok: false,
			message: error instanceof Error ? error.message : String(error),
		} satisfies Loaded<T>;
	}
}

/** Card-shaped placeholder for sections without a skeleton of their own. */
export function SectionSkeleton() {
	return (
		<Card>
			<CardHeader>
				<div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="h-4 w-full animate-pulse rounded bg-muted" />
				<div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
				<div className="h-9 w-full animate-pulse rounded bg-muted" />
			</CardContent>
		</Card>
	);
}

export async function IdentitySection() {
	const user = await load("profile", getUserProfile);
	return <ProfileIdentity initial={user.ok ? user.value : null} />;
}

export async function AccountSecuritySection() {
	const result = await load("connected accounts", getConnectedAccountsAction);
	return <AccountSecurity initial={result.ok ? result.value : null} />;
}

export async function PreferencesSection({ userId }: { userId: string }) {
	const prefs = await load("preferences", () =>
		getProfilePreferencesForUser(userId),
	);
	return <Preferences initial={prefs.ok ? prefs.value : undefined} />;
}

export async function PaymentInfoSection() {
	const info = await load("payment info", getMyPaymentInfo);
	return <PaymentInfo initial={info.ok ? info.value : null} />;
}

export async function MemberAddressSection() {
	const member = await load("member entry", getMyMember);
	return <MemberAddressCard initial={member.ok ? member.value : null} />;
}

export async function BillingOverviewSection() {
	const data = await load("billing data", getUserBillingData);
	return data.ok ? (
		<BillingOverview data={data.value} />
	) : (
		<BillingOverview data={null} error={data.message} />
	);
}

export async function FuchsenBillingSection() {
	const data = await load("Fuchsenladen orders", () =>
		Promise.all([getMyFuchsenOrders(), getMyFuchsenSummary()]),
	);
	if (!data.ok) {
		return (
			<FuchsenBillingOverview
				orders={[]}
				summary={{ openTotal: 0, paidTotal: 0, openCount: 0 }}
				error={data.message}
			/>
		);
	}
	const [orders, summary] = data.value;
	return <FuchsenBillingOverview orders={orders} summary={summary} />;
}

export async function RecentOrdersSection() {
	const page = await load("orders", () => getMyOrdersPage());
	return page.ok ? (
		<RecentOrders initial={page.value} />
	) : (
		<RecentOrders
			initial={{ orders: [], total: 0, page: 1, pageSize: 1 }}
			initialError={page.message}
		/>
	);
}

export async function AchievementsSection() {
	const data = await load("achievements", getUserAchievements);
	return <Achievements data={data.ok ? data.value : []} />;
}
