import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BillingDashboard } from "~/components/rechnungen/BillingDashboard";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { TableSkeleton } from "~/components/ui/page-skeleton";
import { getCurrentOrders } from "~/server/actions/currentOrders";
import { auth } from "~/server/auth";
import { getAllBillPeriods } from "~/server/modules/billing/actions";

// The open orders and the list of bill periods load on the server, in
// parallel (#24). A period's bills load in the browser when its tab is
// opened or, for older periods, when it is expanded.
async function BillingDashboardData() {
	const session = await auth();
	if (!session?.user?.id) {
		redirect("/auth/signin");
	}
	const [currentOrders, periods] = await Promise.all([
		getCurrentOrders(),
		getAllBillPeriods(),
	]);
	return (
		<BillingDashboard
			initial={{ currentOrders, periods, roles: session.user.roles }}
		/>
	);
}

export default function Page() {
	return (
		<>
			<SiteHeader title="Getränkerechnungen" />
			<Suspense
				fallback={
					<div className="container mx-auto p-4">
						<TableSkeleton />
					</div>
				}
			>
				<BillingDashboardData />
			</Suspense>
		</>
	);
}
