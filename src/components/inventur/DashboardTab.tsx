// DashboardTab.tsx
"use client";

import {
	ChevronDown,
	ChevronUp,
	FileSpreadsheet,
	PartyPopper,
	Save,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { createNewBilling } from "~/server/actions/billings/billings";
import {
	type ActiveEventInventory,
	cancelEventInventory,
	type EtaplanWithKostenpunkte,
	finishEventInventory,
	type InventurEvent,
	saveInventoryCount,
	saveQuickAdjustments,
} from "~/server/actions/inventur/inventur";
import { NumericInput } from "../NumericInput";
import type { StockStatusWithDetails } from "./utils";
import { calculateLostValue, getStockStatus } from "./utils";

interface DashboardTabProps {
	stockItems: StockStatusWithDetails[];
	activeEvent: ActiveEventInventory;
	events: InventurEvent[];
	etaplans: EtaplanWithKostenpunkte[];
}

export default function DashboardTab({
	stockItems,
	activeEvent,
	events,
	etaplans,
}: DashboardTabProps) {
	const router = useRouter();

	const [purchases, setPurchases] = useState<{ [key: string]: number }>(() => {
		const initial: { [key: string]: number } = {};
		for (const item of stockItems) {
			if (item.purchasedSince > 0) initial[item.drinkId] = item.purchasedSince;
		}
		return initial;
	});
	const [countedStock, setCountedStock] = useState<{ [key: string]: number }>(
		{},
	);
	const [changedItems, setChangedItems] = useState<Set<string>>(new Set());
	const [isSaving, startSaving] = useTransition();
	const [isQuickSaving, startQuickSaving] = useTransition();
	const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
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
			if (item.purchasedSince > 0)
				initialPurchases[item.drinkId] = item.purchasedSince;
		}
		setCountedStock(initialStock);
		setPurchases(initialPurchases);
	}, [stockItems]);

	const toggleItemExpansion = (drinkId: string) => {
		setExpandedItems((prev) => {
			const next = new Set(prev);
			if (next.has(drinkId)) next.delete(drinkId);
			else next.add(drinkId);
			return next;
		});
	};

	const handlePurchaseInput = (drinkId: string, value: number) => {
		setPurchases((prev) => ({ ...prev, [drinkId]: value }));
		const item = stockItems.find((i) => i.drinkId === drinkId);
		if (!item) return;
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
		const item = stockItems.find((i) => i.drinkId === drinkId);
		if (!item) return;
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
		startQuickSaving(async () => {
			try {
				const adjustments = Array.from(changedItems)
					.map((drinkId) => {
						const item = stockItems.find((i) => i.drinkId === drinkId);
						const purchaseValue = purchases[drinkId] || 0;
						const currentCount = countedStock[drinkId];
						const originalPurchase = item?.purchasedSince || 0;
						const purchaseChanged = originalPurchase !== purchaseValue;
						return {
							drinkId,
							countedStock:
								currentCount !== undefined ? currentCount : undefined,
							purchasedQuantity: purchaseChanged ? purchaseValue : undefined,
						};
					})
					.filter(
						(adj) =>
							adj.countedStock !== undefined ||
							adj.purchasedQuantity !== undefined,
					);

				if (adjustments.length === 0) {
					toast.info("Keine Änderungen zum Speichern");
					return;
				}
				const result = await saveQuickAdjustments(adjustments);
				if (result.success) {
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

	const handleCreateInventory = (withInvoice = false) => {
		startSaving(async () => {
			try {
				const inventoryItems = stockItems.map((item) => ({
					drinkId: item.drinkId,
					countedStock: countedStock[item.drinkId] ?? item.calculatedStock,
					purchasedSince: purchases[item.drinkId] || 0,
				}));
				const result = await saveInventoryCount(inventoryItems);
				if (withInvoice) await createNewBilling(result.totalInventoryLoss);
				if (result.success) {
					toast.success(
						withInvoice
							? "Inventur und Rechnung erfolgreich erstellt"
							: "Inventur erfolgreich erstellt",
					);
					router.refresh();
					setShowInventoryDialog(false);
					setCreateInvoice(false);
				} else {
					throw new Error(result.error);
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

	const buildItems = () =>
		stockItems.map((item) => ({
			drinkId: item.drinkId,
			countedStock: countedStock[item.drinkId] ?? item.calculatedStock,
			purchasedSince: purchases[item.drinkId] || 0,
		}));

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
					`Veranstaltung abgeschlossen — ${r.totalQty} Fl., €${r.totalValue.toFixed(2)} Verbrauch${r.booked ? " · in CC-Kasse gebucht" : ""}`,
				);
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
		if (diff < 0) return "text-red-600 font-semibold";
		if (diff > 0) return "text-green-600 font-semibold";
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

	return (
		<>
			{activeEvent && (
				<div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/30 dark:bg-amber-500/10">
					<div className="flex items-start gap-3">
						<PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
						<div>
							<div className="font-semibold">
								Veranstaltungs-Inventur läuft: {activeEvent.eventName}
							</div>
							<div className="text-muted-foreground text-sm">
								Anfangsbestand erfasst am{" "}
								{new Date(activeEvent.startedAt).toLocaleString("de-DE")}. Zähle
								jetzt den Endbestand und schließe ab.
							</div>
						</div>
					</div>
					<div className="flex shrink-0 gap-2">
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
							<span className="font-semibold text-red-600">
								{totalSoldUnits} Fl.
							</span>
						</span>
						{totalPurchasedUnits > 0 && (
							<span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
								<span className="text-muted-foreground">Eingekauft</span>
								<span className="font-semibold text-green-600">
									{totalPurchasedUnits} Fl.
								</span>
							</span>
						)}
						<span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
							<span className="text-muted-foreground">Bestandswert</span>
							<span className="font-semibold text-primary">
								€{totalInventoryValue.toFixed(2)}
							</span>
						</span>
						{totalLostValue > 0 && (
							<span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
								<span className="text-muted-foreground">Verluste</span>
								<span className="font-semibold text-destructive">
									€{totalLostValue.toFixed(2)}
								</span>
							</span>
						)}
					</div>
				</div>
				<div className="flex shrink-0 gap-2">
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
								onClick={() => setShowInventoryDialog(true)}
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

			{/* Desktop Table */}
			<div className="mt-4 hidden rounded-md border lg:block">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Getränk</TableHead>
							<TableHead className="text-right">Letzte Inventur</TableHead>
							<TableHead className="text-center text-green-600">
								Eingekauft (+)
							</TableHead>
							<TableHead className="text-right text-red-600">
								Verkauft (−)
							</TableHead>
							<TableHead className="text-right">Soll</TableHead>
							<TableHead className="text-center">Ist</TableHead>
							<TableHead className="text-right">Differenz</TableHead>
							<TableHead className="text-right">Preis</TableHead>
							<TableHead className="text-center">Status</TableHead>
							<TableHead className="text-right text-destructive">
								Verlust (€)
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{stockItems.map((item) => {
							const p = purchases[item.drinkId] || 0;
							const calc = item.lastInventoryStock + p - item.soldSince;
							const actual = countedStock[item.drinkId] ?? calc;
							const diff = actual - calc;
							const lostValue = calculateLostValue(
								{ ...item, calculatedStock: calc },
								actual,
							);
							const status = getStockStatus({ calculatedStock: calc }, actual);
							const isChanged = changedItems.has(item.drinkId);

							return (
								<TableRow
									key={item.drinkId}
									className={
										isChanged ? "bg-blue-50 dark:bg-blue-950/20" : undefined
									}
								>
									<TableCell className="font-medium">
										{item.drinkName}
										{isChanged && (
											<span className="ml-2 text-blue-600 text-xs">●</span>
										)}
									</TableCell>
									<TableCell className="text-right">
										{item.lastInventoryStock}
									</TableCell>
									<TableCell className="text-center">
										<div className="flex items-center justify-center gap-1">
											{p > 0 && (
												<span className="font-bold text-green-600">+</span>
											)}
											<Input
												type="number"
												value={p || ""}
												onChange={(e) =>
													handlePurchaseInput(
														item.drinkId,
														e.target.value === "" ? 0 : Number(e.target.value),
													)
												}
												className={`h-8 w-20 ${p > 0 ? "border-green-500 font-semibold text-green-600" : ""}`}
												min="0"
												placeholder="0"
												disabled={isSaving || isQuickSaving}
											/>
										</div>
									</TableCell>
									<TableCell className="text-right">
										<span className="font-semibold text-red-600">
											−{item.soldSince}
										</span>
									</TableCell>
									<TableCell className="text-right">{calc}</TableCell>
									<TableCell className="text-center">
										<NumericInput
											min={0}
											value={actual}
											onChange={(value) =>
												handleCountedStockInput(item.drinkId, value)
											}
											className="mx-auto h-8 w-20"
											disabled={isSaving || isQuickSaving}
										/>
									</TableCell>
									<TableCell className="text-right">
										<span className={diffClass(diff)}>
											{diff > 0 ? `+${diff}` : diff}
										</span>
									</TableCell>
									<TableCell className="text-right">
										€{item.currentPrice.toFixed(2)}
									</TableCell>
									<TableCell className="text-center">
										<Badge className={`${status.color} text-white`}>
											{status.label}
										</Badge>
									</TableCell>
									<TableCell className="text-right font-semibold text-destructive">
										{lostValue > 0 ? `€${lostValue.toFixed(2)}` : "-"}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>

			{/* Mobile Card View */}
			<div className="mt-4 space-y-2 lg:hidden">
				{stockItems.map((item) => {
					const p = purchases[item.drinkId] || 0;
					const calc = item.lastInventoryStock + p - item.soldSince;
					const actual = countedStock[item.drinkId] ?? calc;
					const diff = actual - calc;
					const lostValue = calculateLostValue(
						{ ...item, calculatedStock: calc },
						actual,
					);
					const status = getStockStatus({ calculatedStock: calc }, actual);
					const isChanged = changedItems.has(item.drinkId);
					const isExpanded = expandedItems.has(item.drinkId);

					return (
						<div
							key={item.drinkId}
							className={`rounded-lg border p-3 ${
								isChanged
									? "border-blue-300 bg-blue-50 dark:bg-blue-950/20"
									: "bg-card"
							}`}
						>
							<button
								type="button"
								className="flex w-full items-center justify-between"
								onClick={() => toggleItemExpansion(item.drinkId)}
							>
								<span className="font-medium text-sm">
									{item.drinkName}
									{isChanged && (
										<span className="ml-2 text-blue-600 text-xs">●</span>
									)}
								</span>
								<div className="flex items-center gap-2">
									<Badge className={`${status.color} text-white text-xs`}>
										{status.label}
									</Badge>
									{isExpanded ? (
										<ChevronUp className="h-4 w-4 text-muted-foreground" />
									) : (
										<ChevronDown className="h-4 w-4 text-muted-foreground" />
									)}
								</div>
							</button>

							<div className="mt-2 flex justify-between text-muted-foreground text-xs">
								<span>Soll: {calc}</span>
								<span>Ist: {actual}</span>
								{diff !== 0 && (
									<span className={diffClass(diff)}>
										Diff: {diff > 0 ? `+${diff}` : diff}
									</span>
								)}
								{lostValue > 0 && (
									<span className="text-destructive">
										-€{lostValue.toFixed(2)}
									</span>
								)}
							</div>

							{isExpanded && (
								<div className="mt-3 space-y-3 border-t pt-3">
									<div className="grid grid-cols-3 gap-2 text-xs">
										<div>
											<span className="block text-muted-foreground">
												Letzte Inv.
											</span>
											<span className="font-medium">
												{item.lastInventoryStock}
											</span>
										</div>
										<div>
											<span className="block text-muted-foreground">
												Verkauft
											</span>
											<span className="font-medium text-red-600">
												−{item.soldSince}
											</span>
										</div>
										<div>
											<span className="block text-muted-foreground">Preis</span>
											<span className="font-medium">
												€{item.currentPrice.toFixed(2)}
											</span>
										</div>
									</div>
									<div className="space-y-2">
										<div>
											<span className="mb-1 block text-muted-foreground text-xs">
												Eingekauft
											</span>
											<div className="flex items-center gap-2">
												{p > 0 && (
													<span className="font-bold text-green-600 text-lg">
														+
													</span>
												)}
												<Input
													type="number"
													value={p || ""}
													onChange={(e) =>
														handlePurchaseInput(
															item.drinkId,
															e.target.value === ""
																? 0
																: Number(e.target.value),
														)
													}
													className={`h-8 ${p > 0 ? "border-green-500 font-semibold text-green-600" : ""}`}
													min="0"
													placeholder="0"
													disabled={isSaving || isQuickSaving}
												/>
											</div>
										</div>
										<div>
											<span className="mb-1 block text-muted-foreground text-xs">
												Ist-Bestand
											</span>
											<NumericInput
												min={0}
												value={actual}
												onChange={(value) =>
													handleCountedStockInput(item.drinkId, value)
												}
												className="h-8 w-20"
												disabled={isSaving || isQuickSaving}
											/>
										</div>
									</div>
								</div>
							)}
						</div>
					);
				})}
			</div>

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
							disabled={isSaving}
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
											{e.title} · {new Date(e.date).toLocaleDateString("de-DE")}
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
												{x.consumed} Fl. · €{x.value.toFixed(2)}
											</span>
										</li>
									))}
								</ul>
							)}
							<div className="flex items-center justify-between border-t px-3 py-2 font-semibold">
								<span>Gesamt</span>
								<span>
									{previewQty} Fl. · €{previewValue.toFixed(2)}
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
