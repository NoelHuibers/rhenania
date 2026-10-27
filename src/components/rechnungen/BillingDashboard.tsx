"use client";

import { History } from "lucide-react";
import { TabContent } from "~/components/rechnungen/TabContent";
import { EmptyState } from "~/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { formatDate, formatEUR } from "~/lib/format";
import {
	type BillingDashboardInitial,
	useBillingDashboard,
} from "./use-billing-dashboard";

export type { BillingEntry } from "./billing-types";
export type { BillingDashboardInitial } from "./use-billing-dashboard";

/** The Getränke bills of all members. Data comes from the server (#24). */
export function BillingDashboard({
	initial,
}: {
	initial: BillingDashboardInitial;
}) {
	const {
		activeTab,
		setActiveTab,
		currentOrders,
		currentBillPeriod,
		currentBilling,
		previousBillPeriod,
		previousBilling,
		allBillPeriods,
		olderPeriods,
		isExpanded,
		setPeriodExpanded,
		olderBilling,
		hasRequiredRole,
		handleStatusChange,
	} = useBillingDashboard(initial);

	return (
		<div className="container mx-auto space-y-2 p-4">
			{/* Tabs */}
			<Tabs
				value={activeTab}
				onValueChange={setActiveTab}
				className="space-y-4"
			>
				<TabsList>
					<TabsTrigger value="current-orders">
						Aktuelle Bestellungen
					</TabsTrigger>
					<TabsTrigger value="current-billing">Aktuelle Abrechnung</TabsTrigger>
					{allBillPeriods.length > 1 && (
						<TabsTrigger value="previous-billing">
							Letzte Abrechnung
						</TabsTrigger>
					)}
					{olderPeriods.length > 0 && (
						<TabsTrigger value="older-bills">Ältere Rechnungen</TabsTrigger>
					)}
				</TabsList>

				<TabsContent value="current-orders" className="space-y-4">
					<TabContent
						entries={currentOrders}
						isLoading={false}
						error={null}
						cardTitle="Aktuelle Bestellungen"
						cardDescription="Laufende Bestellungen, die noch nicht abgerechnet wurden"
						emptyMessage="Keine aktuellen Bestellungen gefunden"
					/>
				</TabsContent>

				<TabsContent value="current-billing" className="space-y-4">
					<TabContent
						entries={currentBilling.entries}
						isLoading={currentBilling.isLoading}
						error={currentBilling.error}
						cardTitle="Aktuelle Abrechnungsperiode"
						cardDescription={
							currentBillPeriod
								? `Rechnung ${
										currentBillPeriod.billNumber
									} - Gesamtbetrag: ${formatEUR(currentBillPeriod.totalAmount)}`
								: "Zusammenfassung der aktuellen Abrechnungsperiode"
						}
						headerDate={
							currentBillPeriod?.createdAt
								? formatDate(currentBillPeriod.createdAt)
								: undefined
						}
						showStatus={true}
						emptyMessage="Keine aktuellen Abrechnungen gefunden"
						onStatusChange={hasRequiredRole() ? handleStatusChange : undefined}
						canEditStatus={false}
						billPeriodId={currentBillPeriod?.id}
					/>
				</TabsContent>

				<TabsContent value="previous-billing" className="space-y-4">
					<TabContent
						entries={previousBilling.entries}
						isLoading={previousBilling.isLoading}
						error={previousBilling.error}
						cardTitle="Letzte Abrechnungsperiode"
						cardDescription={
							previousBillPeriod
								? `Rechnung ${
										previousBillPeriod.billNumber
									} - Gesamtbetrag: ${formatEUR(
										previousBillPeriod.totalAmount,
									)}`
								: "Zusammenfassung der letzten Abrechnungsperiode"
						}
						headerDate={
							previousBillPeriod?.createdAt
								? formatDate(previousBillPeriod.createdAt)
								: undefined
						}
						showStatus={true}
						emptyMessage="Keine vorherigen Abrechnungen gefunden"
						onStatusChange={hasRequiredRole() ? handleStatusChange : undefined}
						canEditStatus={false}
						billPeriodId={previousBillPeriod?.id}
					/>
				</TabsContent>

				<TabsContent value="older-bills" className="space-y-4">
					<div className="space-y-6">
						{/* Collapsed until opened: each period loads its bills then. */}
						{olderPeriods.map((period) => {
							const periodBills = olderBilling(period);
							return (
								<TabContent
									key={period.id}
									entries={periodBills.entries}
									isLoading={periodBills.isLoading}
									error={periodBills.error}
									cardTitle={`Rechnung ${period.billNumber}`}
									cardDescription={`Abrechnungsbericht - Gesamtbetrag: ${formatEUR(
										period.totalAmount,
									)}`}
									headerDate={formatDate(period.createdAt)}
									showStatus={true}
									emptyMessage="Keine Abrechnungen in dieser Periode gefunden"
									onStatusChange={
										hasRequiredRole() ? handleStatusChange : undefined
									}
									canEditStatus={false}
									billPeriodId={period.id}
									expanded={isExpanded(period.id)}
									onExpandedChange={(open) =>
										setPeriodExpanded(period.id, open)
									}
								/>
							);
						})}
						{olderPeriods.length === 0 && (
							<EmptyState
								icon={<History />}
								title="Keine älteren Rechnungen vorhanden"
							>
								Ältere Abrechnungen erscheinen hier, sobald mehr als zwei
								Abrechnungen erstellt wurden.
							</EmptyState>
						)}
					</div>
				</TabsContent>
			</Tabs>
		</div>
	);
}
