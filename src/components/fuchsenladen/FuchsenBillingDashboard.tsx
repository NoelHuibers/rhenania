"use client";

import { Loader2, Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BillingTable } from "~/components/rechnungen/BillingTable";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { formatEUR } from "~/lib/format";
import { getUserRoles } from "~/server/actions/admin/userRoles";
import {
	type FuchsenBillingConfig,
	getFuchsenBillingConfig,
} from "~/server/actions/fuchsenladen/billingConfig";
import {
	type FuchsenBillingEntry,
	type FuchsenBillPeriod,
	getMyFuchsenBills,
} from "~/server/actions/fuchsenladen/billings";
import { useSession } from "~/server/auth/client";
import { FuchsenwartBilling } from "./FuchsenwartBilling";
import { makeDetails } from "./fuchsen-details";

const EMPTY_CONFIG: FuchsenBillingConfig = {
	id: "singleton",
	senderName: "",
	senderStreet: "",
	senderCity: "",
	location: "",
	iban: "",
	accountHolder: "",
	paypalBaseUrl: "",
	paymentDueDays: 14,
	updatedAt: null,
	updatedBy: null,
};

export function FuchsenBillingDashboard() {
	const { data: session, isPending } = useSession();
	const [roles, setRoles] = useState<string[]>([]);
	const [config, setConfig] = useState<FuchsenBillingConfig>(EMPTY_CONFIG);
	const isAuthenticated = !isPending && !!session?.user?.id;
	const isFuchsenwart = roles.includes("Fuchs") || roles.includes("Admin");

	useEffect(() => {
		if (!session?.user?.id) {
			setRoles([]);
			return;
		}
		getUserRoles(session.user.id)
			.then((r) => setRoles(Array.isArray(r) ? r.map((role) => role.name) : []))
			.catch(() => setRoles([]));
	}, [session?.user?.id]);

	useEffect(() => {
		if (!session?.user?.id) {
			return;
		}
		getFuchsenBillingConfig()
			.then(setConfig)
			.catch(() => setConfig(EMPTY_CONFIG));
	}, [session?.user?.id]);

	return (
		<>
			<SiteHeader title="Fuchsenrechnungen" />
			<div className="container mx-auto space-y-4 p-4">
				{!isAuthenticated ? (
					<div className="flex items-center justify-center py-16">
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
					</div>
				) : isFuchsenwart ? (
					<FuchsenwartBilling config={config} onConfigSaved={setConfig} />
				) : (
					<MemberBilling config={config} />
				)}
			</div>
		</>
	);
}

// --- Member view: only the current user's own orders & bills ----------------

function MemberBilling({ config }: { config: FuchsenBillingConfig }) {
	const [bills, setBills] = useState<
		{ period: FuchsenBillPeriod | null; bill: FuchsenBillingEntry }[]
	>([]);
	const [loading, setLoading] = useState(true);
	const Details = makeDetails(config);

	useEffect(() => {
		getMyFuchsenBills()
			.then(setBills)
			.catch(() => toast.error("Fehler beim Laden der Rechnungen"))
			.finally(() => setLoading(false));
	}, []);

	// One row per bill, labelled by its bill number.
	const entries: FuchsenBillingEntry[] = bills.map(({ period, bill }) => ({
		...bill,
		name: period?.billNumber ?? "Rechnung",
	}));

	const openTotal = bills
		.filter(({ bill }) => bill.status !== "Bezahlt")
		.reduce((sum, { bill }) => sum + bill.totalDue, 0);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between text-lg sm:text-xl">
					<span className="flex items-center gap-2">
						<Receipt className="h-5 w-5" />
						Meine Fuchsenrechnungen
					</span>
					{openTotal > 0 && (
						<span className="font-bold text-base text-destructive">
							{formatEUR(openTotal)} offen
						</span>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<BillingTable
					entries={entries}
					showStatus
					isLoading={loading}
					emptyMessage="Du hast noch keine Fuchsenrechnungen."
					canEditStatus={false}
					detailsComponent={Details}
				/>
			</CardContent>
		</Card>
	);
}
