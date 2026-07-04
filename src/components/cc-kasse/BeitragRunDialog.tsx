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
import { parseDecimalInput } from "~/lib/decimal";
import type { Etaplan } from "~/server/actions/cc-kasse/etaplans";
import { createBeitragRun } from "~/server/actions/members/semesterbeitrag";

type KpOption = { id: string; name: string; category: string };

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	etaplan: Etaplan;
	kostenpunkte: KpOption[];
	onSaved: (runId?: string) => void;
};

export function BeitragRunDialog({
	open,
	onOpenChange,
	etaplan,
	kostenpunkte,
	onSaved,
}: Props) {
	const [name, setName] = useState("");
	const [kostenpunktId, setKostenpunktId] = useState("");
	const [amount, setAmount] = useState("28");
	const [mahnungFee, setMahnungFee] = useState("5");
	const [dueDate, setDueDate] = useState<Date | undefined>();
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (!open) return;
		setName(`Semesterbeitrag ${etaplan.name}`);
		const guess = kostenpunkte.find((k) =>
			k.name.toLowerCase().includes("beitrag"),
		);
		setKostenpunktId(guess?.id ?? kostenpunkte[0]?.id ?? "");
		setAmount("28");
		setMahnungFee("5");
		const d = new Date();
		d.setDate(d.getDate() + 14);
		setDueDate(d);
	}, [open, etaplan, kostenpunkte]);

	const num = (s: string) => {
		const v = parseDecimalInput(s);
		return Number.isFinite(v) ? v : 0;
	};

	const save = () => {
		if (!name.trim()) {
			toast.error("Name erforderlich");
			return;
		}
		if (!kostenpunktId) {
			toast.error("Einnahmen-Kostenpunkt wählen");
			return;
		}
		if (!dueDate) {
			toast.error("Fälligkeitsdatum erforderlich");
			return;
		}
		const amt = num(amount);
		if (amt <= 0) {
			toast.error("Gültiger Betrag erforderlich");
			return;
		}

		startTransition(async () => {
			const res = await createBeitragRun({
				name: name.trim(),
				etaplanId: etaplan.id,
				kostenpunktId,
				amount: amt,
				mahnungFee: num(mahnungFee),
				dueDate,
			});
			if (res.success) {
				toast.success(
					`Beitragslauf erstellt — ${res.data.chargesCreated} Mitglieder`,
				);
				onSaved(res.data.runId);
				onOpenChange(false);
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>Neuer Beitragslauf</DialogTitle>
				</DialogHeader>

				<div className="grid gap-4 py-2">
					<div className="grid gap-2">
						<Label htmlFor="br-name">Name</Label>
						<Input
							id="br-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="br-kp">
							Einnahmen-Kostenpunkt (Etatplan {etaplan.name})
						</Label>
						<Select value={kostenpunktId} onValueChange={setKostenpunktId}>
							<SelectTrigger id="br-kp">
								<SelectValue placeholder="Kostenpunkt wählen" />
							</SelectTrigger>
							<SelectContent>
								{kostenpunkte.map((kp) => (
									<SelectItem key={kp.id} value={kp.id}>
										{kp.category} – {kp.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{kostenpunkte.length === 0 && (
							<p className="text-muted-foreground text-xs">
								Dieser Etatplan hat keine Kostenpunkte — lege zuerst einen
								"Semesterbeitrag"-Kostenpunkt an.
							</p>
						)}
					</div>
					<div className="grid grid-cols-2 gap-3">
						<div className="grid gap-2">
							<Label htmlFor="br-amount">Beitrag (€)</Label>
							<Input
								id="br-amount"
								inputMode="decimal"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="br-mahn">Mahngebühr (€)</Label>
							<Input
								id="br-mahn"
								inputMode="decimal"
								value={mahnungFee}
								onChange={(e) => setMahnungFee(e.target.value)}
							/>
						</div>
					</div>
					<div className="grid gap-2">
						<Label>Fällig am</Label>
						<DatePicker value={dueDate} onChange={setDueDate} />
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
					<Button
						onClick={save}
						disabled={isPending || kostenpunkte.length === 0}
					>
						Erstellen
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
