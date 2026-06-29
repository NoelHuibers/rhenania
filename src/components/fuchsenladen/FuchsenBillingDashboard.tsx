"use client";

import { Download, Loader2, Receipt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
	BillingTable,
	formatCurrency,
} from "~/components/rechnungen/BillingTable";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getUserRoles } from "~/server/actions/admin/userRoles";
import {
	createNewFuchsenBilling,
	type FuchsenBillingEntry,
	type FuchsenBillPeriod,
	getAllFuchsenBillPeriods,
	getFuchsenBillPeriodCSV,
	getFuchsenBillsForPeriod,
	getMyFuchsenBills,
	getUnbilledFuchsenOrdersGrouped,
	updateFuchsenBillStatus,
} from "~/server/actions/fuchsenladen/billings";
import { useSession } from "~/server/auth/client";

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

export default function FuchsenBillingDashboard() {
	const { data: session, isPending } = useSession();
	const [roles, setRoles] = useState<string[]>([]);
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

	return (
		<>
			<SiteHeader title="Fuchsenrechnungen" />
			<div className="container mx-auto space-y-4 p-4">
				{!isAuthenticated ? (
					<div className="flex items-center justify-center py-16">
						<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
					</div>
				) : isFuchsenwart ? (
					<FuchsenwartBilling />
				) : (
					<MemberBilling />
				)}
			</div>
		</>
	);
}

// --- Member view: only the current user's own orders & bills ----------------

function MemberBilling() {
	const [bills, setBills] = useState<
		{ period: FuchsenBillPeriod | null; bill: FuchsenBillingEntry }[]
	>([]);
	const [loading, setLoading] = useState(true);

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
							{formatCurrency(openTotal)} offen
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
				/>
			</CardContent>
		</Card>
	);
}

// --- Fuchsenwart view: manage all bills, run new billing periods ------------

function FuchsenwartBilling() {
	const [activeTab, setActiveTab] = useState("current-orders");
	const [periods, setPeriods] = useState<FuchsenBillPeriod[]>([]);
	const [unbilled, setUnbilled] = useState<FuchsenBillingEntry[]>([]);
	const [currentBills, setCurrentBills] = useState<FuchsenBillingEntry[]>([]);
	const [historyBills, setHistoryBills] = useState<
		Map<string, FuchsenBillingEntry[]>
	>(new Map());
	const [loading, setLoading] = useState(true);
	const [isRunning, setIsRunning] = useState(false);

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
		const unbilledTotal = unbilled.reduce((s, e) => s + e.totalDue, 0);
		if (
			!window.confirm(
				`Neue Abrechnung für ${unbilled.length} Mitglied(er) über ${formatCurrency(
					unbilledTotal,
				)} erstellen? Die laufende Periode wird abgeschlossen.`,
			)
		) {
			return;
		}
		setIsRunning(true);
		try {
			const result = await createNewFuchsenBilling();
			if (result.success) {
				toast.success(result.message);
				await loadAll();
				setActiveTab("current-billing");
			} else {
				toast.error(result.message);
			}
		} catch {
			toast.error("Fehler beim Erstellen der Abrechnung");
		} finally {
			setIsRunning(false);
		}
	};

	const handleStatusChange = async (
		billId: string,
		newStatus: FuchsenBillingEntry["status"],
	) => {
		if (!newStatus) return;
		const previous = currentBills.find((b) => b.id === billId)?.status;
		setCurrentBills((prev) =>
			prev.map((b) => (b.id === billId ? { ...b, status: newStatus } : b)),
		);
		const result = await updateFuchsenBillStatus(billId, newStatus);
		if (result.success) {
			toast.success("Status aktualisiert");
		} else {
			setCurrentBills((prev) =>
				prev.map((b) => (b.id === billId ? { ...b, status: previous } : b)),
			);
			toast.error(result.error || "Fehler beim Aktualisieren");
		}
	};

	const handleExport = async (periodId: string) => {
		const result = await getFuchsenBillPeriodCSV(periodId);
		if (result.success && result.csvContent) {
			downloadCSV(result.csvContent, result.fileName ?? "fuchsenrechnung.csv");
			toast.success("CSV exportiert");
		} else {
			toast.error(result.error || "Export fehlgeschlagen");
		}
	};

	const loadHistory = async (periodId: string) => {
		if (historyBills.has(periodId)) return;
		const bills = await getFuchsenBillsForPeriod(periodId);
		setHistoryBills((prev) => new Map(prev).set(periodId, bills));
	};

	const olderPeriods = periods.slice(1);
	const unbilledTotal = unbilled.reduce((s, e) => s + e.totalDue, 0);

	return (
		<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
			<TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-muted p-1 lg:flex lg:w-auto">
				<TabsTrigger value="current-orders">Offene Bestellungen</TabsTrigger>
				<TabsTrigger value="current-billing">Aktuelle Abrechnung</TabsTrigger>
				{olderPeriods.length > 0 && (
					<TabsTrigger value="history">Frühere Rechnungen</TabsTrigger>
				)}
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
								{formatCurrency(unbilledTotal)}
							</p>
						</div>
						<Button
							onClick={handleRunBilling}
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
									? `Gesamtbetrag ${formatCurrency(currentPeriod.totalAmount)}`
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
									{new Date(period.createdAt).toLocaleDateString("de-DE")} ·{" "}
									{formatCurrency(period.totalAmount)}
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
		</Tabs>
	);
}
