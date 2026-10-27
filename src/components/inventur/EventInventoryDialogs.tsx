"use client";

import { useRouter } from "next/navigation";
import { type TransitionStartFunction, useState } from "react";
import { toast } from "sonner";
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
import { formatDate, formatEUR } from "~/lib/format";
import {
	type EtaplanWithKostenpunkte,
	finishEventInventory,
	type InventoryCountItem,
	type InventurEvent,
	saveInventoryCount,
} from "~/server/actions/inventur/inventur";
import type { StockStatusWithDetails } from "./utils";

/**
 * Start (opening stock) and finish (closing stock, consumption, optional
 * CC-Kasse booking) of an event inventory.
 */
export function EventInventoryDialogs({
	events,
	etaplans,
	stockItems,
	purchases,
	countedStock,
	buildItems,
	onCounted,
	startOpen,
	onStartOpenChange,
	finishOpen,
	onFinishOpenChange,
	isPending,
	startTransition,
}: {
	events: InventurEvent[];
	etaplans: EtaplanWithKostenpunkte[];
	stockItems: StockStatusWithDetails[];
	purchases: { [key: string]: number };
	countedStock: { [key: string]: number };
	/** The current count, as saved by a full inventory. */
	buildItems: () => InventoryCountItem[];
	/** Called once the count was saved: the "Ist" values start over. */
	onCounted: () => void;
	startOpen: boolean;
	onStartOpenChange: (open: boolean) => void;
	finishOpen: boolean;
	onFinishOpenChange: (open: boolean) => void;
	isPending: boolean;
	startTransition: TransitionStartFunction;
}) {
	const router = useRouter();
	const [eventSel, setEventSel] = useState("");
	const [freeName, setFreeName] = useState("");
	const [freeDate, setFreeDate] = useState("");
	const [doBook, setDoBook] = useState(true);
	const [etaplanId, setEtaplanId] = useState(
		() =>
			etaplans.find((e) => e.status === "Aktiv")?.id ?? etaplans[0]?.id ?? "",
	);
	const [kostenpunktId, setKostenpunktId] = useState("");

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
		startTransition(async () => {
			const res = await saveInventoryCount(buildItems(), { startEvent: info });
			if (res.success) {
				toast.success(
					"Veranstaltungs-Inventur gestartet — Anfangsbestand gespeichert",
				);
				onCounted();
				onStartOpenChange(false);
				router.refresh();
			} else {
				toast.error(res.error ?? "Fehler beim Starten");
			}
		});
	};

	const handleFinishEvent = () => {
		startTransition(async () => {
			const res = await finishEventInventory(buildItems(), {
				kostenpunktId: doBook ? kostenpunktId || null : null,
			});
			if (res.success) {
				const r = res.report;
				toast.success(
					`Veranstaltung abgeschlossen — ${r.totalQty} Fl., ${formatEUR(r.totalValue)} Verbrauch${r.booked ? " · in CC-Kasse gebucht" : ""}`,
				);
				onCounted();
				onFinishOpenChange(false);
				router.refresh();
			} else {
				toast.error(res.error);
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

	return (
		<>
			{/* Veranstaltungs-Inventur: Start */}
			<Dialog open={startOpen} onOpenChange={onStartOpenChange}>
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
							onClick={() => onStartOpenChange(false)}
							disabled={isPending}
						>
							Abbrechen
						</Button>
						<Button
							onClick={handleStartEvent}
							disabled={isPending || !eventSel}
						>
							Anfangsbestand speichern
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Veranstaltungs-Inventur: Abschluss */}
			<Dialog open={finishOpen} onOpenChange={onFinishOpenChange}>
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
							onClick={() => onFinishOpenChange(false)}
							disabled={isPending}
						>
							Abbrechen
						</Button>
						<Button
							onClick={handleFinishEvent}
							disabled={isPending || (doBook && !kostenpunktId)}
						>
							{isPending
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
