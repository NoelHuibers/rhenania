"use client";

import { Download, Loader2, Receipt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { BillingEntry } from "~/components/rechnungen/BillingDashboard";
import { BillingTable } from "~/components/rechnungen/BillingTable";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ConfirmAction } from "~/components/ui/confirm-action";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { formatDate, formatEUR } from "~/lib/format";
import {
	type FuchsenBillingConfig,
	getFuchsenBillingConfig,
} from "~/server/actions/fuchsenladen/billingConfig";
import {
	createNewFuchsenBilling,
	type FuchsenBillingEntry,
	type FuchsenBillPeriod,
	getAllFuchsenBillPeriods,
	getFuchsenBillPeriodCSV,
	getFuchsenBillsForPeriod,
	getUnbilledFuchsenOrdersGrouped,
	updateFuchsenBillStatus,
} from "~/server/actions/fuchsenladen/billings";
import { FuchsenBillingSettings } from "./FuchsenBillingSettings";
import { makeDetails } from "./fuchsen-details";

function downloadCSV(content: string, fileName: string) {
	const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	setTimeout(() => {
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}, 100);
}

/** Fuchsenwart view: manage all bills, run new billing periods. */
export function FuchsenwartBilling({
	config,
	onConfigSaved,
}: {
	config: FuchsenBillingConfig;
	onConfigSaved: (config: FuchsenBillingConfig) => void;
}) {
	const [activeTab, setActiveTab] = useState("current-orders");
	const [periods, setPeriods] = useState<FuchsenBillPeriod[]>([]);
	const [unbilled, setUnbilled] = useState<FuchsenBillingEntry[]>([]);
	const [currentBills, setCurrentBills] = useState<FuchsenBillingEntry[]>([]);
	const [historyBills, setHistoryBills] = useState<
		Map<string, FuchsenBillingEntry[]>
	>(new Map());
	const [loading, setLoading] = useState(true);
	const [isRunning, setIsRunning] = useState(false);
	const Details = makeDetails(config);

	const currentPeriod = periods[0] ?? null;

	const loadAll = useCallback(async () => {
		setLoading(true);
		try {
			const [periodList, unbilledList] = await Promise.all([
				getAllFuchsenBillPeriods(),
				getUnbilledFuchsenOrdersGrouped(),
			]);
			setPeriods(periodList);
			setUnbilled(unbilledList);
			if (periodList[0]) {
				setCurrentBills(await getFuchsenBillsForPeriod(periodList[0].id));
			} else {
				setCurrentBills([]);
			}
		} catch {
			toast.error("Fehler beim Laden der Abrechnungen");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadAll();
	}, [loadAll]);

	const handleRunBilling = async () => {
		setIsRunning(true);
		try {
			const result = await createNewFuchsenBilling();
			if (result.ok) {
				toast.success(result.data.message);
				await loadAll();
				setActiveTab("current-billing");
			} else {
				toast.error(result.error);
			}
		} catch {
			toast.error("Fehler beim Erstellen der Abrechnung");
		} finally {
			setIsRunning(false);
		}
	};

	const handleStatusChange = async (
		billId: string,
		newStatus: BillingEntry["status"],
	) => {
		// "Übertragen" is set by the billing run only (the status button
		// disables it); guard so the type narrows.
		if (!newStatus || newStatus === "Übertragen") {
			return;
		}
		const previous = currentBills.find((b) => b.id === billId)?.status;
		setCurrentBills((prev) =>
			prev.map((b) => (b.id === billId ? { ...b, status: newStatus } : b)),
		);
		const result = await updateFuchsenBillStatus(billId, newStatus);
		if (result.ok) {
			toast.success("Status aktualisiert");
		} else {
			setCurrentBills((prev) =>
				prev.map((b) => (b.id === billId ? { ...b, status: previous } : b)),
			);
			toast.error(result.error);
		}
	};

	const handleExport = async (periodId: string) => {
		const result = await getFuchsenBillPeriodCSV(periodId);
		if (result.ok) {
			downloadCSV(result.data.csvContent, result.data.fileName);
			toast.success("CSV exportiert");
		} else {
			toast.error(result.error);
		}
	};

	const loadHistory = async (periodId: string) => {
		if (historyBills.has(periodId)) {
			return;
		}
		const bills = await getFuchsenBillsForPeriod(periodId);
		setHistoryBills((prev) => new Map(prev).set(periodId, bills));
	};

	const olderPeriods = periods.slice(1);
	const unbilledTotal = unbilled.reduce((s, e) => s + e.totalDue, 0);

	return (
		<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
			<TabsList>
				<TabsTrigger value="current-orders">Offene Bestellungen</TabsTrigger>
				<TabsTrigger value="current-billing">Aktuelle Abrechnung</TabsTrigger>
				{olderPeriods.length > 0 && (
					<TabsTrigger value="history">Frühere Rechnungen</TabsTrigger>
				)}
				<TabsTrigger value="settings">Zahlungsdaten</TabsTrigger>
			</TabsList>

			<TabsContent value="current-orders" className="space-y-4">
				<Card>
					<CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="text-lg">
								Noch nicht abgerechnete Bestellungen
							</CardTitle>
							<p className="mt-1 text-muted-foreground text-sm">
								Vorschau des nächsten Rechnungslaufs · Summe{" "}
								{formatEUR(unbilledTotal)}
							</p>
						</div>
						<ConfirmAction
							title="Neue Abrechnung erstellen?"
							description={`Neue Abrechnung für ${unbilled.length} Mitglied(er) über ${formatEUR(unbilledTotal)}. Die laufende Periode wird abgeschlossen.`}
							confirmLabel="Abrechnung erstellen"
							destructive={false}
							onConfirm={handleRunBilling}
						>
							<Button
								disabled={isRunning || unbilled.length === 0}
								className="gap-2"
							>
								{isRunning ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Receipt className="h-4 w-4" />
								)}
								Rechnung erstellen
							</Button>
						</ConfirmAction>
					</CardHeader>
					<CardContent>
						<BillingTable
							entries={unbilled}
							isLoading={loading}
							emptyMessage="Keine offenen Bestellungen."
						/>
					</CardContent>
				</Card>
			</TabsContent>

			<TabsContent value="current-billing" className="space-y-4">
				<Card>
					<CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
						<div>
							<CardTitle className="text-lg">
								{currentPeriod
									? `Rechnung ${currentPeriod.billNumber}`
									: "Aktuelle Abrechnung"}
							</CardTitle>
							<p className="mt-1 text-muted-foreground text-sm">
								{currentPeriod
									? `Gesamtbetrag ${formatEUR(currentPeriod.totalAmount)}`
									: "Noch keine Abrechnung erstellt"}
							</p>
						</div>
						{currentPeriod && (
							<Button
								variant="outline"
								size="sm"
								className="gap-2"
								onClick={() => handleExport(currentPeriod.id)}
							>
								<Download className="h-4 w-4" />
								Export CSV
							</Button>
						)}
					</CardHeader>
					<CardContent>
						<BillingTable
							entries={currentBills}
							showStatus
							canEditStatus
							onStatusChange={handleStatusChange}
							isLoading={loading}
							emptyMessage="Noch keine Abrechnung. Erstelle oben eine Rechnung."
							detailsComponent={Details}
						/>
					</CardContent>
				</Card>
			</TabsContent>

			<TabsContent value="history" className="space-y-4">
				{olderPeriods.map((period) => (
					<Card key={period.id}>
						<CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<CardTitle className="text-base">
									Rechnung {period.billNumber}
								</CardTitle>
								<p className="mt-1 text-muted-foreground text-sm">
									{formatDate(period.createdAt)} ·{" "}
									{formatEUR(period.totalAmount)}
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								className="gap-2"
								onClick={() => handleExport(period.id)}
							>
								<Download className="h-4 w-4" />
								CSV
							</Button>
						</CardHeader>
						<CardContent>
							{historyBills.has(period.id) ? (
								<BillingTable
									entries={historyBills.get(period.id) ?? []}
									showStatus
									emptyMessage="Keine Rechnungen in dieser Periode."
									detailsComponent={Details}
								/>
							) : (
								<Button
									variant="ghost"
									size="sm"
									onClick={() => loadHistory(period.id)}
								>
									Details laden
								</Button>
							)}
						</CardContent>
					</Card>
				))}
			</TabsContent>

			<TabsContent value="settings" className="space-y-4">
				<FuchsenBillingSettings
					onSaved={() => getFuchsenBillingConfig().then(onConfigSaved)}
				/>
			</TabsContent>
		</Tabs>
	);
}
