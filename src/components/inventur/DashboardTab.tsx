// DashboardTab.tsx
"use client";

import { FileSpreadsheet, PartyPopper, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { formatDateTime, formatEUR } from "~/lib/format";
import {
	type ActiveEventInventory,
	cancelEventInventory,
	type EtaplanWithKostenpunkte,
	type InventurEvent,
	saveQuickAdjustments,
} from "~/server/actions/inventur/inventur";
import { InventoryCountDialog, submitInventory } from "./CountMode";
import { removeSavedItemIds } from "./changed-items";
import { EventInventoryDialogs } from "./EventInventoryDialogs";
import {
	buildInventoryCount,
	buildQuickAdjustments,
	findUncountedDrinks,
	isBlockedByUncounted,
} from "./inventory-count";
import { StockTable } from "./StockTable";
import type { StockStatusWithDetails } from "./utils";
import { calculateLostValue } from "./utils";

function withId(ids: Set<string>, id: string): Set<string> {
	return ids.has(id) ? ids : new Set(ids).add(id);
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
				if (!result.ok) {
					toast.error(result.error);
					return;
				}
				setChangedItems((currentItems) =>
					removeSavedItemIds(currentItems, savedItemIds),
				);
				toast.success(`${adjustments.length} Artikel aktualisiert`);
				router.refresh();
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

	const handleCancelEvent = () => {
		startEventTransition(async () => {
			const res = await cancelEventInventory();
			if (res.ok) {
				toast.success("Veranstaltungs-Inventur abgebrochen");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
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
			<StockTable
				stockItems={stockItems}
				purchases={purchases}
				countedStock={countedStock}
				changedItems={changedItems}
				disabled={isSaving || isQuickSaving}
				onPurchaseInput={handlePurchaseInput}
				onCountedStockInput={handleCountedStockInput}
			/>

			<InventoryCountDialog
				open={showInventoryDialog}
				onOpenChange={setShowInventoryDialog}
				totalSoldUnits={totalSoldUnits}
				uncounted={uncountedDrinks}
				total={stockItems.length}
				acceptUncounted={acceptUncounted}
				onAcceptUncountedChange={setAcceptUncounted}
				createInvoice={createInvoice}
				onCreateInvoiceChange={setCreateInvoice}
				isSaving={isSaving}
				blocked={blockedByUncounted}
				onCreate={handleCreateInventory}
			/>

			<EventInventoryDialogs
				events={events}
				etaplans={etaplans}
				stockItems={stockItems}
				purchases={purchases}
				countedStock={countedStock}
				buildItems={buildItems}
				onCounted={() => setCountedIds(new Set())}
				startOpen={showStartEvent}
				onStartOpenChange={setShowStartEvent}
				finishOpen={showFinishEvent}
				onFinishOpenChange={setShowFinishEvent}
				isPending={isEventPending}
				startTransition={startEventTransition}
			/>
		</>
	);
}
