"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
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
import { formatEur } from "~/lib/cc-kasse-format";
import { parseDecimalInput } from "~/lib/decimal";
import {
	createKostenpunkt,
	type KostenpunktWithPositions,
	type LinkableEvent,
	updateKostenpunkt,
} from "~/server/actions/cc-kasse/kostenpunkte";

const NEW_CATEGORY = "__new__";
const NO_EVENT = "__none__";

type PositionRow = { bemerkung: string; ausgaben: string; einnahmen: string };

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	etaplanId: string;
	kostenpunkt?: KostenpunktWithPositions | null;
	categories: { category: string; categoryOrder: number }[];
	events: LinkableEvent[];
	onSaved: () => void;
};

export function KostenpunktDialog({
	open,
	onOpenChange,
	etaplanId,
	kostenpunkt,
	categories,
	events,
	onSaved,
}: Props) {
	const isEdit = !!kostenpunkt;
	const [categorySel, setCategorySel] = useState("");
	const [newCategory, setNewCategory] = useState("");
	const [name, setName] = useState("");
	const [eventId, setEventId] = useState<string>(NO_EVENT);
	const [positions, setPositions] = useState<PositionRow[]>([
		{ bemerkung: "", ausgaben: "", einnahmen: "" },
	]);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (!open) return;
		if (kostenpunkt) {
			setCategorySel(kostenpunkt.category);
			setNewCategory("");
			setName(kostenpunkt.name);
			setEventId(kostenpunkt.eventId ?? NO_EVENT);
			setPositions(
				kostenpunkt.positionen.length
					? kostenpunkt.positionen.map((p) => ({
							bemerkung: p.bemerkung ?? "",
							ausgaben: p.ausgaben ? String(p.ausgaben) : "",
							einnahmen: p.einnahmen ? String(p.einnahmen) : "",
						}))
					: [{ bemerkung: "", ausgaben: "", einnahmen: "" }],
			);
		} else {
			setCategorySel(categories[0]?.category ?? NEW_CATEGORY);
			setNewCategory("");
			setName("");
			setEventId(NO_EVENT);
			setPositions([{ bemerkung: "", ausgaben: "", einnahmen: "" }]);
		}
	}, [open, kostenpunkt, categories]);

	const num = (s: string) => {
		const v = parseDecimalInput(s);
		return Number.isFinite(v) ? v : 0;
	};
	const budgetSum = positions.reduce((s, p) => s + num(p.ausgaben), 0);
	const incomeSum = positions.reduce((s, p) => s + num(p.einnahmen), 0);

	const setPos = (i: number, key: keyof PositionRow, value: string) => {
		setPositions((prev) =>
			prev.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)),
		);
	};
	const addPos = () =>
		setPositions((prev) => [
			...prev,
			{ bemerkung: "", ausgaben: "", einnahmen: "" },
		]);
	const removePos = (i: number) =>
		setPositions((prev) => prev.filter((_, idx) => idx !== i));

	const save = () => {
		const isNew = categorySel === NEW_CATEGORY;
		const category = (isNew ? newCategory : categorySel).trim();
		if (!category) {
			toast.error("Kategorie ist erforderlich");
			return;
		}
		if (!name.trim()) {
			toast.error("Name ist erforderlich");
			return;
		}

		// Resolve category order: reuse an existing category's order, otherwise
		// assign the next available order.
		const existing = categories.find((c) => c.category === category);
		const categoryOrder = existing
			? existing.categoryOrder
			: categories.reduce((m, c) => Math.max(m, c.categoryOrder), -1) + 1;

		const positionen = positions
			.filter(
				(p) => p.bemerkung.trim() || p.ausgaben.trim() || p.einnahmen.trim(),
			)
			.map((p, i) => ({
				bemerkung: p.bemerkung.trim() || null,
				ausgaben: num(p.ausgaben),
				einnahmen: num(p.einnahmen),
				displayOrder: i,
			}));

		startTransition(async () => {
			const base = {
				category,
				categoryOrder,
				name: name.trim(),
				eventId: eventId === NO_EVENT ? null : eventId,
				positionen,
			};
			const res = kostenpunkt
				? await updateKostenpunkt(kostenpunkt.id, base)
				: await createKostenpunkt({ ...base, etaplanId });

			if (res.success) {
				toast.success(
					isEdit ? "Kostenpunkt gespeichert" : "Kostenpunkt erstellt",
				);
				onSaved();
				onOpenChange(false);
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] flex-col sm:max-w-[640px]">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Kostenpunkt bearbeiten" : "Neuer Kostenpunkt"}
					</DialogTitle>
				</DialogHeader>

				<div className="flex-1 space-y-4 overflow-y-auto px-1 py-2">
					<div className="grid grid-cols-2 gap-3">
						<div className="grid gap-2">
							<Label htmlFor="kp-category">Kategorie (Gruppe)</Label>
							<Select value={categorySel} onValueChange={setCategorySel}>
								<SelectTrigger id="kp-category">
									<SelectValue placeholder="Kategorie wählen" />
								</SelectTrigger>
								<SelectContent>
									{categories.map((c) => (
										<SelectItem key={c.category} value={c.category}>
											{c.category}
										</SelectItem>
									))}
									<SelectItem value={NEW_CATEGORY}>
										＋ Neue Kategorie…
									</SelectItem>
								</SelectContent>
							</Select>
							{categorySel === NEW_CATEGORY && (
								<Input
									value={newCategory}
									onChange={(e) => setNewCategory(e.target.value)}
									placeholder="z.B. Semesterveranstaltungen"
								/>
							)}
						</div>
						<div className="grid gap-2">
							<Label htmlFor="kp-name">Name</Label>
							<Input
								id="kp-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="z.B. Weinheim"
							/>
						</div>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="kp-event">
							Verknüpfte Veranstaltung (optional)
						</Label>
						<Select value={eventId} onValueChange={setEventId}>
							<SelectTrigger id="kp-event">
								<SelectValue placeholder="Keine" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NO_EVENT}>Keine</SelectItem>
								{events.map((ev) => (
									<SelectItem key={ev.id} value={ev.id}>
										{ev.title} ({new Date(ev.date).toLocaleDateString("de-DE")})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label>Positionen</Label>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={addPos}
							>
								<Plus className="mr-1 h-4 w-4" /> Position
							</Button>
						</div>

						<div className="hidden grid-cols-[1fr_110px_110px_36px] items-center gap-2 px-1 text-muted-foreground text-xs sm:grid">
							<span>Bemerkung</span>
							<span className="text-right">Ausgaben (€)</span>
							<span className="text-right">Einnahmen (€)</span>
							<span />
						</div>

						{positions.map((p, i) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: position rows are order-stable within the dialog session
								key={i}
								className="grid grid-cols-2 gap-2 rounded-md border p-2 sm:grid-cols-[1fr_110px_110px_36px] sm:items-center sm:rounded-none sm:border-0 sm:p-0"
							>
								<Input
									className="col-span-2 sm:col-span-1"
									value={p.bemerkung}
									onChange={(e) => setPos(i, "bemerkung", e.target.value)}
									placeholder="Bemerkung (z.B. Zimmer)"
								/>
								<Input
									inputMode="decimal"
									className="text-right"
									value={p.ausgaben}
									onChange={(e) => setPos(i, "ausgaben", e.target.value)}
									placeholder="Ausgaben €"
								/>
								<Input
									inputMode="decimal"
									className="text-right"
									value={p.einnahmen}
									onChange={(e) => setPos(i, "einnahmen", e.target.value)}
									placeholder="Einnahmen €"
								/>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									onClick={() => removePos(i)}
									disabled={positions.length === 1}
									className="col-span-2 justify-self-end sm:col-span-1 sm:justify-self-auto"
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						))}

						<div className="flex justify-end gap-6 border-t pt-2 text-sm">
							<span>
								Budget:{" "}
								<span className="font-semibold">{formatEur(budgetSum)}</span>
							</span>
							<span>
								Einnahmen:{" "}
								<span className="font-semibold">{formatEur(incomeSum)}</span>
							</span>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Abbrechen
					</Button>
					<Button onClick={save} disabled={isPending}>
						{isEdit ? "Speichern" : "Erstellen"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
