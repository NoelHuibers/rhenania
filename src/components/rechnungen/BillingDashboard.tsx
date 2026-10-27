"use client";

import { History } from "lucide-react";
import { TabContent } from "~/components/rechnungen/TabContent";
import { EmptyState } from "~/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { formatDate, formatEUR } from "~/lib/format";
import { SiteHeader } from "../trinken/SiteHeader";
import { useBillingDashboard } from "./use-billing-dashboard";

export type { BillingEntry } from "./billing-types";

export function BillingDashboard() {
	const {
		activeTab,
		setActiveTab,
		currentOrders,
		isLoadingOrders,
		ordersError,
		currentBilling,
		isLoadingBilling,
		billingError,
		currentBillPeriod,
		previousBilling,
		isLoadingPreviousBilling,
		previousBillingError,
		previousBillPeriod,
		allBillPeriods,
		billPeriodsData,
		hasRequiredRole,
		handleStatusChange,
	} = useBillingDashboard();

	const olderPeriods = allBillPeriods.slice(2);

	return (
		<>
			<SiteHeader title="Getränkerechnungen" />
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
						<TabsTrigger value="current-billing">
							Aktuelle Abrechnung
						</TabsTrigger>
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
							isLoading={isLoadingOrders}
							error={ordersError}
							cardTitle="Aktuelle Bestellungen"
							cardDescription="Laufende Bestellungen, die noch nicht abgerechnet wurden"
							emptyMessage="Keine aktuellen Bestellungen gefunden"
						/>
					</TabsContent>

					<TabsContent value="current-billing" className="space-y-4">
						<TabContent
							entries={currentBilling}
							isLoading={isLoadingBilling}
							error={billingError}
							cardTitle="Aktuelle Abrechnungsperiode"
							cardDescription={
								currentBillPeriod
									? `Rechnung ${
											currentBillPeriod.billNumber
										} - Gesamtbetrag: ${formatEUR(
											currentBillPeriod.totalAmount,
										)}`
									: "Zusammenfassung der aktuellen Abrechnungsperiode"
							}
							headerDate={
								currentBillPeriod?.createdAt
									? formatDate(currentBillPeriod.createdAt)
									: undefined
							}
							showStatus={true}
							emptyMessage="Keine aktuellen Abrechnungen gefunden"
							onStatusChange={
								hasRequiredRole() ? handleStatusChange : undefined
							}
							canEditStatus={false}
							billPeriodId={
								allBillPeriods[0]?.id ? allBillPeriods[0].id : undefined
							}
						/>
					</TabsContent>

					<TabsContent value="previous-billing" className="space-y-4">
						<TabContent
							entries={previousBilling}
							isLoading={isLoadingPreviousBilling}
							error={previousBillingError}
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
							onStatusChange={
								hasRequiredRole() ? handleStatusChange : undefined
							}
							canEditStatus={false}
							billPeriodId={
								allBillPeriods[1]?.id ? allBillPeriods[1].id : undefined
							}
						/>
					</TabsContent>

					<TabsContent value="older-bills" className="space-y-4">
						<div className="space-y-6">
							{olderPeriods.map((period) => {
								const periodEntries = billPeriodsData.get(period.id) || [];
								const isLoadingPeriod = !billPeriodsData.has(period.id);

								return (
									<TabContent
										key={period.id}
										entries={periodEntries}
										isLoading={isLoadingPeriod}
										error={null}
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
		</>
	);
}
