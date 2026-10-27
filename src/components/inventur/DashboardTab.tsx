// DashboardTab.tsx
"use client";

import { FileSpreadsheet, PartyPopper, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { DataList, type DataListColumn } from "~/components/ui/data-list";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { StatusBadge } from "~/components/ui/status-badge";
import { formatDate, formatDateTime, formatEUR } from "~/lib/format";
import {
	type ActiveEventInventory,
	type CloseInventoryAndBillResult,
	cancelEventInventory,
	closeInventoryAndBill,
	type EtaplanWithKostenpunkte,
	finishEventInventory,
	type InventoryCountItem,
	type InventurEvent,
	saveInventoryCount,
	saveQuickAdjustments,
} from "~/server/actions/inventur/inventur";
import { NumericInput } from "../NumericInput";
import { removeSavedItemIds } from "./changed-items";
import {
	buildInventoryCount,
	buildQuickAdjustments,
	findUncountedDrinks,
	isBlockedByUncounted,
} from "./inventory-count";
import type { StockStatusWithDetails } from "./utils";
import { calculateLostValue, getStockStatus } from "./utils";

/** Toasts the outcome of a full inventory; true when it was saved. */
function notifyInventory(
	result: Awaited<ReturnType<typeof saveInventoryCount>>,
): boolean {
	if (!result.success) {
		toast.error(result.error ?? "Inventur konnte nicht erstellt werden");
		return false;
	}
	toast.success("Inventur erfolgreich erstellt");
	return true;
}

/** Toasts which step of "Inventur + Rechnung" failed; true when the inventory was saved. */
function notifyInventoryAndBilling(
	result: CloseInventoryAndBillResult,
): boolean {
	if (result.success) {
		if (result.billsCreated > 0) {
			toast.success("Inventur und Rechnung erfolgreich erstellt");
		} else {
			toast.warning(
				`Inventur gespeichert, keine Rechnung erstellt: ${result.message}`,
			);
		}
		return true;
	}
	// A billing failure leaves the inventory closed: only billing is missing.
	toast.error(result.error);
	return result.failedStep === "billing";
}

/**
 * Saves a full inventory, with billing when asked, and toasts the outcome.
 * True when the inventory was saved (even if the billing then failed).
 */
async function submitInventory(
	items: InventoryCountItem[],
	withInvoice: boolean,
): Promise<boolean> {
	if (withInvoice) {
		return notifyInventoryAndBilling(await closeInventoryAndBill(items));
	}
	return notifyInventory(await saveInventoryCount(items));
}

/** One drink in the stock list, with its computed Soll/Ist figures. */
type StockRow = {
	item: StockStatusWithDetails;
	p: number;
	calc: number;
	actual: number;
	diff: number;
	lostValue: number;
	status: ReturnType<typeof getStockStatus>;
	isChanged: boolean;
};

function withId(ids: Set<string>, id: string): Set<string> {
	return ids.has(id) ? ids : new Set(ids).add(id);
}

/** Lists the drinks nobody counted and asks before taking their shown "Ist". */
function UncountedWarning({
	uncounted,
	total,
	accepted,
	onAcceptedChange,
}: {
	uncounted: StockStatusWithDetails[];
	total: number;
	accepted: boolean;
	onAcceptedChange: (accepted: boolean) => void;
}) {
	if (uncounted.length === 0) {
		return null;
	}
	return (
		<div className="rounded-md border border-warning/40 bg-warning-muted p-3 text-sm">
			<p className="font-medium">
				{uncounted.length} von {total} Getränken wurden nicht gezählt:
			</p>
			<p className="mt-1 max-h-24 overflow-y-auto text-muted-foreground">
				{uncounted.map((item) => item.drinkName).join(", ")}
			</p>
			<div className="mt-3 flex items-start space-x-2">
				<Checkbox
					id="accept-uncounted"
					checked={accepted}
					onCheckedChange={(checked) => onAcceptedChange(checked === true)}
				/>
				<Label
					htmlFor="accept-uncounted"
					className="font-normal text-sm leading-snug"
				>
					Für nicht gezählte Getränke den angezeigten Ist-Wert übernehmen
				</Label>
			</div>
		</div>
	);
}

interface DashboardTabProps {
	stockItems: StockStatusWithDetails[];
	activeEvent: ActiveEventInventory;
	events: InventurEvent[];
	etaplans: EtaplanWithKostenpunkte[];
	/** Markup profit since the last inventory; null without the markup feature. */
	profit?: number | null;
}

export function DashboardTab({
	stockItems,
	activeEvent,
	events,
	etaplans,
	profit = null,
}: DashboardTabProps) {
	const router = useRouter();

	const [purchases, setPurchases] = useState<{ [key: string]: number }>(() => {
		const initial: { [key: string]: number } = {};
		for (const item of stockItems) {
			if (item.purchasedSince > 0) {
				initial[item.drinkId] = item.purchasedSince;
			}
		}
		return initial;
	});
	const [countedStock, setCountedStock] = useState<{ [key: string]: number }>(
		{},
	);
	const [changedItems, setChangedItems] = useState<Set<string>>(new Set());
	// Drinks whose "Ist" was entered; the others only show a pre-filled value.
	const [countedIds, setCountedIds] = useState<Set<string>>(new Set());
	const [acceptUncounted, setAcceptUncounted] = useState(false);
	const [isSaving, startSaving] = useTransition();
	const [isQuickSaving, startQuickSaving] = useTransition();
	const [showInventoryDialog, setShowInventoryDialog] = useState(false);
	const [createInvoice, setCreateInvoice] = useState(false);
	const [showStartEvent, setShowStartEvent] = useState(false);
	const [showFinishEvent, setShowFinishEvent] = useState(false);
	const [eventSel, setEventSel] = useState("");
	const [freeName, setFreeName] = useState("");
	const [freeDate, setFreeDate] = useState("");
	const [doBook, setDoBook] = useState(true);
	const [etaplanId, setEtaplanId] = useState(
		() =>
			etaplans.find((e) => e.status === "Aktiv")?.id ?? etaplans[0]?.id ?? "",
	);
	const [kostenpunktId, setKostenpunktId] = useState("");
	const [isEventPending, startEventTransition] = useTransition();

	useEffect(() => {
		const initialStock: { [key: string]: number } = {};
		const initialPurchases: { [key: string]: number } = {};
		for (const item of stockItems) {
			initialStock[item.drinkId] = item.countedStock ?? item.calculatedStock;
			if (item.purchasedSince > 0) {
				initialPurchases[item.drinkId] = item.purchasedSince;
			}
		}
		setCountedStock(initialStock);
		setPurchases(initialPurchases);
	}, [stockItems]);

	const handlePurchaseInput = (drinkId: string, value: number) => {
		setPurchases((prev) => ({ ...prev, [drinkId]: value }));
		const item = stockItems.find((i) => i.drinkId === drinkId);
		if (!item) {
			return;
		}
		const originalPurchase = item.purchasedSince || 0;
		if (value !== originalPurchase) {
			setChangedItems((prev) => new Set(prev).add(drinkId));
		} else if (countedStock[drinkId] === item.calculatedStock) {
			setChangedItems((prev) => {
				const next = new Set(prev);
				next.delete(drinkId);
				return next;
			});
		}
		if (
			countedStock[drinkId] ===
			item.calculatedStock + (purchases[drinkId] || 0)
		) {
			setCountedStock((prev) => ({
				...prev,
				[drinkId]: item.calculatedStock + value,
			}));
		}
	};

	const handleCountedStockInput = (drinkId: string, value: number) => {
		setCountedStock((prev) => ({ ...prev, [drinkId]: value }));
		setCountedIds((prev) => withId(prev, drinkId));
		const item = stockItems.find((i) => i.drinkId === drinkId);
		if (!item) {
			return;
		}
		const expected = item.calculatedStock + (purchases[drinkId] || 0);
		if (value !== expected) {
			setChangedItems((prev) => new Set(prev).add(drinkId));
		} else if (!purchases[drinkId]) {
			setChangedItems((prev) => {
				const next = new Set(prev);
				next.delete(drinkId);
				return next;
			});
		}
	};

	const handleQuickSave = () => {
		const savedItemIds = Array.from(changedItems);
		startQuickSaving(async () => {
			try {
				const adjustments = buildQuickAdjustments(savedItemIds, stockItems, {
					countedStock,
					purchases,
					countedIds,
				});

				if (adjustments.length === 0) {
					toast.info("Keine Änderungen zum Speichern");
					return;
				}
				const result = await saveQuickAdjustments(adjustments);
				if (result.success) {
					setChangedItems((currentItems) =>
						removeSavedItemIds(currentItems, savedItemIds),
					);
					toast.success(`${adjustments.length} Artikel aktualisiert`);
					router.refresh();
				} else {
					throw new Error(result.error);
				}
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Änderungen konnten nicht gespeichert werden",
				);
			}
		});
	};

	const buildItems = () =>
		buildInventoryCount(stockItems, { countedStock, purchases });

	const uncountedDrinks = findUncountedDrinks(stockItems, countedIds);
	const blockedByUncounted = isBlockedByUncounted(
		uncountedDrinks,
		acceptUncounted,
	);

	const finishInventory = () => {
		setCountedIds(new Set());
		setAcceptUncounted(false);
		setShowInventoryDialog(false);
		setCreateInvoice(false);
		router.refresh();
	};

	const handleCreateInventory = (withInvoice = false) => {
		startSaving(async () => {
			try {
				if (await submitInventory(buildItems(), withInvoice)) {
					finishInventory();
				}
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Inventur konnte nicht erstellt werden",
				);
			}
		});
	};

	const handleStartEvent = () => {
		let info: {
			eventId?: string | null;
			eventName: string;
			eventDate?: Date | null;
		};
		if (eventSel === "__free__") {
			if (!freeName.trim()) {
				toast.error("Name der Veranstaltung fehlt");
				return;
			}
			info = {
				eventName: freeName.trim(),
				eventDate: freeDate ? new Date(freeDate) : null,
			};
		} else {
			const ev = events.find((e) => e.id === eventSel);
			if (!ev) {
				toast.error("Bitte Veranstaltung wählen");
				return;
			}
			info = { eventId: ev.id, eventName: ev.title, eventDate: ev.date };
		}
		startEventTransition(async () => {
			const res = await saveInventoryCount(buildItems(), { startEvent: info });
			if (res.success) {
				toast.success(
					"Veranstaltungs-Inventur gestartet — Anfangsbestand gespeichert",
				);
				setCountedIds(new Set());
				setShowStartEvent(false);
				router.refresh();
			} else {
				toast.error(res.error ?? "Fehler beim Starten");
			}
		});
	};

	const handleFinishEvent = () => {
		startEventTransition(async () => {
			const res = await finishEventInventory(buildItems(), {
				kostenpunktId: doBook ? kostenpunktId || null : null,
			});
			if (res.success) {
				const r = res.report;
				toast.success(
					`Veranstaltung abgeschlossen — ${r.totalQty} Fl., ${formatEUR(r.totalValue)} Verbrauch${r.booked ? " · in CC-Kasse gebucht" : ""}`,
				);
				setCountedIds(new Set());
				setShowFinishEvent(false);
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	const handleCancelEvent = () => {
		startEventTransition(async () => {
			const res = await cancelEventInventory();
			if (res.success) {
				toast.success("Veranstaltungs-Inventur abgebrochen");
				router.refresh();
			} else {
				toast.error(res.error ?? "Fehler");
			}
		});
	};

	const consumptionPreview = stockItems
		.map((item) => {
			const p = purchases[item.drinkId] || 0;
			const calc = item.lastInventoryStock + p - item.soldSince;
			const actual = countedStock[item.drinkId] ?? calc;
			const consumed = Math.max(0, calc - actual);
			return {
				name: item.drinkName,
				consumed,
				value: consumed * item.currentPrice,
			};
		})
		.filter((x) => x.consumed > 0);
	const previewQty = consumptionPreview.reduce((s, x) => s + x.consumed, 0);
	const previewValue = consumptionPreview.reduce((s, x) => s + x.value, 0);
	const kpOptions =
		etaplans.find((e) => e.id === etaplanId)?.kostenpunkte ?? [];

	const diffClass = (diff: number) => {
		if (diff < 0) {
			return "text-destructive font-semibold";
		}
		if (diff > 0) {
			return "text-success font-semibold";
		}
		return "text-muted-foreground";
	};

	const totalSoldUnits = stockItems.reduce((s, i) => s + i.soldSince, 0);
	const totalPurchasedUnits = stockItems.reduce(
		(s, i) => s + (purchases[i.drinkId] || 0),
		0,
	);
	const totalLostValue = stockItems.reduce((s, item) => {
		const p = purchases[item.drinkId] || 0;
		const calc = item.lastInventoryStock + p - item.soldSince;
		const actual = countedStock[item.drinkId] ?? calc;
		return s + calculateLostValue({ ...item, calculatedStock: calc }, actual);
	}, 0);
	const totalInventoryValue = stockItems.reduce((s, item) => {
		const actual = countedStock[item.drinkId] ?? item.calculatedStock;
		return s + actual * item.currentPrice;
	}, 0);

	const hasChanges = changedItems.size > 0;
	const busy = isSaving || isQuickSaving;
	const stockRows: StockRow[] = stockItems.map((item) => {
		const p = purchases[item.drinkId] || 0;
		const calc = item.lastInventoryStock + p - item.soldSince;
		const actual = countedStock[item.drinkId] ?? calc;
		return {
			item,
			p,
			calc,
			actual,
			diff: actual - calc,
			lostValue: calculateLostValue({ ...item, calculatedStock: calc }, actual),
			status: getStockStatus({ calculatedStock: calc }, actual),
			isChanged: changedItems.has(item.drinkId),
		};
	});

	const stockColumns: DataListColumn<StockRow>[] = [
		{
			id: "drink",
			header: "Getränk",
			cell: ({ row: { original: r } }) => (
				<>
					{r.item.drinkName}
					{r.isChanged && <span className="ml-2 text-info text-xs">●</span>}
				</>
			),
			meta: { mobile: "title", className: "font-medium" },
		},
		{
			id: "lastInventory",
			header: "Letzte Inventur",
			cell: ({ row }) => row.original.item.lastInventoryStock,
			meta: { mobile: "meta", className: "md:text-right" },
		},
		{
			id: "purchased",
			header: "Eingekauft (+)",
			cell: ({ row: { original: r } }) => (
				<div className="flex items-center gap-1 md:justify-center">
					{r.p > 0 && <span className="font-bold text-success">+</span>}
					<Input
						type="number"
						aria-label={`Eingekauft – ${r.item.drinkName}`}
						value={r.p || ""}
						onChange={(e) =>
							handlePurchaseInput(
								r.item.drinkId,
								e.target.value === "" ? 0 : Number(e.target.value),
							)
						}
						className={`h-8 w-20 ${r.p > 0 ? "border-success font-semibold text-success" : ""}`}
						min="0"
						placeholder="0"
						disabled={busy}
					/>
				</div>
			),
			meta: {
				mobile: "meta",
				label: "Eingekauft",
				headerClassName: "text-center text-success",
				cellClassName: "md:text-center",
			},
		},
		{
			id: "sold",
			header: "Verkauft (−)",
			cell: ({ row }) => (
				<span className="font-semibold text-destructive">
					−{row.original.item.soldSince}
				</span>
			),
			meta: {
				mobile: "meta",
				label: "Verkauft",
				className: "md:text-right",
				headerClassName: "text-destructive",
			},
		},
		{
			id: "calc",
			header: "Soll",
			cell: ({ row }) => row.original.calc,
			meta: { mobile: "meta", className: "md:text-right" },
		},
		{
			id: "actual",
			header: "Ist",
			cell: ({ row: { original: r } }) => (
				<NumericInput
					min={0}
					aria-label={`Ist – ${r.item.drinkName}`}
					value={r.actual}
					onChange={(value) => handleCountedStockInput(r.item.drinkId, value)}
					className="h-8 w-20 md:mx-auto"
					disabled={busy}
				/>
			),
			meta: { mobile: "meta", className: "md:text-center" },
		},
		{
			id: "diff",
			header: "Differenz",
			cell: ({ row: { original: r } }) => (
				<span className={diffClass(r.diff)}>
					{r.diff > 0 ? `+${r.diff}` : r.diff}
				</span>
			),
			meta: { mobile: "meta", className: "md:text-right" },
		},
		{
			id: "price",
			header: "Preis",
			cell: ({ row }) => formatEUR(row.original.item.currentPrice),
			meta: { mobile: "meta", className: "md:text-right" },
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row: { original: r } }) => (
				<StatusBadge tone={r.status.tone} strong={r.status.strong}>
					{r.status.label}
				</StatusBadge>
			),
			meta: { mobile: "subtitle", className: "md:text-center" },
		},
		{
			id: "lost",
			header: "Verlust (€)",
			cell: ({ row: { original: r } }) =>
				r.lostValue > 0 ? formatEUR(r.lostValue) : "-",
			meta: {
				mobile: "meta",
				label: "Verlust",
				className: "md:text-right",
				headerClassName: "text-destructive",
				cellClassName: "font-semibold text-destructive",
			},
		},
	];

	return (
		<>
			{activeEvent && (
				<div className="mb-4 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-muted p-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-start gap-3">
						<PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-warning-muted-foreground" />
						<div>
							<div className="font-semibold">
								Veranstaltungs-Inventur läuft: {activeEvent.eventName}
							</div>
							<div className="text-muted-foreground text-sm">
								Anfangsbestand erfasst am{" "}
								{formatDateTime(activeEvent.startedAt)}. Zähle jetzt den
								Endbestand und schließe ab.
							</div>
						</div>
					</div>
					<div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row">
						<Button
							size="sm"
							onClick={() => setShowFinishEvent(true)}
							disabled={isEventPending}
						>
							Endbestand abschließen
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={handleCancelEvent}
							disabled={isEventPending}
						>
							Abbrechen
						</Button>
					</div>
				</div>
			)}

			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h2 className="font-semibold text-lg">Aktueller Bestand</h2>
					<div className="mt-2 flex flex-wrap gap-2">
						<span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
							<span className="text-muted-foreground">Verkauft</span>
							<span className="font-semibold text-destructive">
								{totalSoldUnits} Fl.
							</span>
						</span>
						{totalPurchasedUnits > 0 && (
							<span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
								<span className="text-muted-foreground">Eingekauft</span>
								<span className="font-semibold text-success">
									{totalPurchasedUnits} Fl.
								</span>
							</span>
						)}
						<span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
							<span className="text-muted-foreground">Bestandswert</span>
							<span className="font-semibold text-primary">
								{formatEUR(totalInventoryValue)}
							</span>
						</span>
						{profit !== null && (
							<span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
								<span className="text-muted-foreground">Gewinn</span>
								<span className="font-semibold text-success">
									{formatEUR(profit)}
								</span>
							</span>
						)}
						{totalLostValue > 0 && (
							<span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
								<span className="text-muted-foreground">Verluste</span>
								<span className="font-semibold text-destructive">
									{formatEUR(totalLostValue)}
								</span>
							</span>
						)}
					</div>
				</div>
				<div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row">
					<Button
						onClick={handleQuickSave}
						disabled={!hasChanges || isQuickSaving}
						variant={hasChanges ? "default" : "outline"}
						size="sm"
					>
						<Save className="mr-2 h-4 w-4" />
						{isQuickSaving
							? "Speichere..."
							: hasChanges
								? `${changedItems.size} speichern`
								: "Keine Änderungen"}
					</Button>
					{!activeEvent && (
						<>
							<Button
								onClick={() => setShowStartEvent(true)}
								disabled={isSaving || isEventPending}
								variant="outline"
								size="sm"
							>
								<PartyPopper className="mr-2 h-4 w-4" />
								Veranstaltung
							</Button>
							<Button
								onClick={() => {
									setAcceptUncounted(false);
									setShowInventoryDialog(true);
								}}
								disabled={isSaving}
								variant="secondary"
								size="sm"
							>
								<FileSpreadsheet className="mr-2 h-4 w-4" />
								{isSaving ? "Erstelle..." : "Vollständige Inventur"}
							</Button>
						</>
					)}
				</div>
			</div>

			{/* Stock: table from md up, one card per drink below */}
			<DataList
				data={stockRows}
				columns={stockColumns}
				getRowId={(r) => r.item.drinkId}
				caption="Aktueller Bestand"
				metaLayout="grid"
				className="mt-4 md:rounded-md md:border"
				rowClassName={(r) =>
					r.isChanged ? "bg-info-muted max-md:border-info/40" : undefined
				}
			/>

			{/* Inventory Confirmation Dialog */}
			<Dialog open={showInventoryDialog} onOpenChange={setShowInventoryDialog}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Vollständige Inventur erstellen</DialogTitle>
						<DialogDescription>
							Die Inventur wird mit den aktuellen Bestandszahlen erstellt.
							{totalSoldUnits > 0 && (
								<span className="mt-2 block">
									Es wurden <strong>{totalSoldUnits} Flaschen</strong> seit der
									letzten Inventur verkauft.
								</span>
							)}
						</DialogDescription>
					</DialogHeader>
					<UncountedWarning
						uncounted={uncountedDrinks}
						total={stockItems.length}
						accepted={acceptUncounted}
						onAcceptedChange={setAcceptUncounted}
					/>
					<div className="flex items-center space-x-2 py-4">
						<Checkbox
							id="create-invoice"
							checked={createInvoice}
							onCheckedChange={(checked) =>
								setCreateInvoice(checked as boolean)
							}
						/>
						<Label
							htmlFor="create-invoice"
							className="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
						>
							Auch Rechnung erstellen
						</Label>
					</div>
					<DialogFooter className="flex gap-2">
						<Button
							variant="outline"
							onClick={() => setShowInventoryDialog(false)}
						>
							Abbrechen
						</Button>
						<Button
							onClick={() => handleCreateInventory(createInvoice)}
							disabled={isSaving || blockedByUncounted}
						>
							{isSaving ? (
								"Erstelle..."
							) : (
								<>
									<FileSpreadsheet className="mr-2 h-4 w-4" />
									Inventur erstellen
								</>
							)}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Veranstaltungs-Inventur: Start */}
			<Dialog open={showStartEvent} onOpenChange={setShowStartEvent}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Veranstaltungs-Inventur starten</DialogTitle>
						<DialogDescription>
							Der aktuell erfasste Bestand wird als{" "}
							<strong>Anfangsbestand</strong> gespeichert. Nach der
							Veranstaltung zählst du erneut — die Differenz ist der Verbrauch.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<div className="grid gap-1.5">
							<Label>Veranstaltung</Label>
							<Select value={eventSel} onValueChange={setEventSel}>
								<SelectTrigger>
									<SelectValue placeholder="Veranstaltung wählen" />
								</SelectTrigger>
								<SelectContent>
									{events.map((e) => (
										<SelectItem key={e.id} value={e.id}>
											{e.title} · {formatDate(e.date)}
										</SelectItem>
									))}
									<SelectItem value="__free__">Andere (Freitext)…</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{eventSel === "__free__" && (
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<div className="grid gap-1.5">
									<Label htmlFor="ev-name">Name</Label>
									<Input
										id="ev-name"
										value={freeName}
										onChange={(e) => setFreeName(e.target.value)}
										placeholder="z.B. Sommerfest"
									/>
								</div>
								<div className="grid gap-1.5">
									<Label htmlFor="ev-date">Datum</Label>
									<Input
										id="ev-date"
										type="date"
										value={freeDate}
										onChange={(e) => setFreeDate(e.target.value)}
									/>
								</div>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowStartEvent(false)}
							disabled={isEventPending}
						>
							Abbrechen
						</Button>
						<Button
							onClick={handleStartEvent}
							disabled={isEventPending || !eventSel}
						>
							Anfangsbestand speichern
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Veranstaltungs-Inventur: Abschluss */}
			<Dialog open={showFinishEvent} onOpenChange={setShowFinishEvent}>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Veranstaltung abschließen</DialogTitle>
						<DialogDescription>
							Der aktuell gezählte Bestand ist der <strong>Endbestand</strong>.
							Folgender Verbrauch wird verbucht:
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-2">
						<div className="rounded-md border">
							{consumptionPreview.length === 0 ? (
								<p className="p-3 text-muted-foreground text-sm">
									Kein Verbrauch erkannt (Endbestand ≥ erwartet).
								</p>
							) : (
								<ul className="max-h-56 divide-y overflow-y-auto text-sm">
									{consumptionPreview.map((x) => (
										<li
											key={x.name}
											className="flex items-center justify-between px-3 py-1.5"
										>
											<span>{x.name}</span>
											<span className="text-muted-foreground">
												{x.consumed} Fl. · {formatEUR(x.value)}
											</span>
										</li>
									))}
								</ul>
							)}
							<div className="flex items-center justify-between border-t px-3 py-2 font-semibold">
								<span>Gesamt</span>
								<span>
									{previewQty} Fl. · {formatEUR(previewValue)}
								</span>
							</div>
						</div>

						<div className="flex items-center gap-2">
							<Checkbox
								id="ev-book"
								checked={doBook}
								onCheckedChange={(c) => setDoBook(c === true)}
							/>
							<Label htmlFor="ev-book" className="font-normal">
								Verbrauch als Ausgabe in die CC-Kasse buchen
							</Label>
						</div>
						{doBook && (
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<div className="grid gap-1.5">
									<Label>Etatplan</Label>
									<Select
										value={etaplanId}
										onValueChange={(v) => {
											setEtaplanId(v);
											setKostenpunktId("");
										}}
									>
										<SelectTrigger>
											<SelectValue placeholder="Etatplan" />
										</SelectTrigger>
										<SelectContent>
											{etaplans.map((e) => (
												<SelectItem key={e.id} value={e.id}>
													{e.name}
													{e.status === "Abgeschlossen"
														? " (abgeschlossen)"
														: ""}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="grid gap-1.5">
									<Label>Kostenpunkt</Label>
									<Select
										value={kostenpunktId}
										onValueChange={setKostenpunktId}
									>
										<SelectTrigger>
											<SelectValue placeholder="Kostenpunkt" />
										</SelectTrigger>
										<SelectContent>
											{kpOptions.map((k) => (
												<SelectItem key={k.id} value={k.id}>
													{k.category} · {k.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowFinishEvent(false)}
							disabled={isEventPending}
						>
							Abbrechen
						</Button>
						<Button
							onClick={handleFinishEvent}
							disabled={isEventPending || (doBook && !kostenpunktId)}
						>
							{isEventPending
								? "Speichere..."
								: doBook
									? "Abschließen & buchen"
									: "Abschließen"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
