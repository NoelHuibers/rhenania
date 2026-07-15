"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { DatePicker } from "~/components/ui/date-picker";
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
import { Textarea } from "~/components/ui/textarea";
import { parseDecimalInput } from "~/lib/decimal";
import {
	createEinnahme,
	updateEinnahme,
} from "~/server/actions/cc-kasse/einnahmen";
import type { KostenpunktOption } from "./ReimbursementDialog";

export type EditingEinnahme = {
	id: string;
	kostenpunktId: string;
	kostenpunktName: string;
	kostenpunktCategory: string;
	amount: number;
	description: string;
	incomeDate: Date | number;
};

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	kostenpunkte: KostenpunktOption[];
	editing?: EditingEinnahme | null;
	onSaved: () => void;
};

export function EinnahmeDialog({
	open,
	onOpenChange,
	kostenpunkte,
	editing,
	onSaved,
}: Props) {
	const isEdit = !!editing;
	const [kostenpunktId, setKostenpunktId] = useState("");
	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");
	const [incomeDate, setIncomeDate] = useState<Date | undefined>();
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (!open) return;
		if (editing) {
			setKostenpunktId(editing.kostenpunktId);
			setAmount(String(editing.amount));
			setDescription(editing.description);
			setIncomeDate(new Date(editing.incomeDate));
		} else {
			setKostenpunktId("");
			setAmount("");
			setDescription("");
			setIncomeDate(new Date());
		}
	}, [open, editing]);

	// Make sure the edited row's Kostenpunkt is selectable even if it belongs
	// to a plan that is no longer in the bookable list.
	const options =
		editing && !kostenpunkte.some((k) => k.id === editing.kostenpunktId)
			? [
					{
						id: editing.kostenpunktId,
						name: editing.kostenpunktName,
						category: editing.kostenpunktCategory,
					},
					...kostenpunkte,
				]
			: kostenpunkte;

	const submit = () => {
		if (!kostenpunktId) {
			toast.error("Bitte einen Kostenpunkt wählen");
			return;
		}
		const amt = parseDecimalInput(amount);
		if (!Number.isFinite(amt) || amt <= 0) {
			toast.error("Gültiger Betrag erforderlich");
			return;
		}
		if (!description.trim()) {
			toast.error("Beschreibung erforderlich");
			return;
		}
		if (!incomeDate) {
			toast.error("Datum erforderlich");
			return;
		}

		startTransition(async () => {
			const input = {
				kostenpunktId,
				description: description.trim(),
				amount: amt,
				incomeDate,
			};
			const res = editing
				? await updateEinnahme(editing.id, input)
				: await createEinnahme(input);

			if (res.success) {
				toast.success(isEdit ? "Einnahme gespeichert" : "Einnahme gebucht");
				onSaved();
				onOpenChange(false);
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[520px]">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Einnahme bearbeiten" : "Einnahme buchen"}
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 px-1 py-2">
					<div className="grid gap-2">
						<Label htmlFor="ein-kp">Kostenpunkt</Label>
						<Select value={kostenpunktId} onValueChange={setKostenpunktId}>
							<SelectTrigger id="ein-kp">
								<SelectValue placeholder="Kostenpunkt wählen" />
							</SelectTrigger>
							<SelectContent>
								{options.map((kp) => (
									<SelectItem key={kp.id} value={kp.id}>
										{kp.category} – {kp.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="grid gap-2">
							<Label htmlFor="ein-amount">Betrag (€)</Label>
							<Input
								id="ein-amount"
								inputMode="decimal"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								placeholder="0,00"
							/>
						</div>
						<div className="grid gap-2">
							<Label>Datum</Label>
							<DatePicker value={incomeDate} onChange={setIncomeDate} />
						</div>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="ein-desc">Beschreibung</Label>
						<Textarea
							id="ein-desc"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Woher kommt die Einnahme? (z.B. Barkasse Cocktailabend)"
							rows={2}
						/>
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
					<Button onClick={submit} disabled={isPending}>
						{isPending ? "Wird gespeichert…" : isEdit ? "Speichern" : "Buchen"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
