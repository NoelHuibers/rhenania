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
import {
	createEtaplan,
	type Etaplan,
	updateEtaplan,
} from "~/server/actions/cc-kasse/etaplans";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	etaplan?: Etaplan | null;
	onSaved: (id?: string) => void;
};

export function EtaplanDialog({ open, onOpenChange, etaplan, onSaved }: Props) {
	const isEdit = !!etaplan;
	const [semesterType, setSemesterType] = useState<"SS" | "WS">("SS");
	const [year, setYear] = useState("");
	const [name, setName] = useState("");
	const [nameTouched, setNameTouched] = useState(false);
	const [startDate, setStartDate] = useState<Date | undefined>();
	const [endDate, setEndDate] = useState<Date | undefined>();
	const [status, setStatus] = useState<"Aktiv" | "Abgeschlossen">("Aktiv");
	const [notes, setNotes] = useState("");
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (!open) return;
		if (etaplan) {
			setSemesterType(etaplan.semesterType);
			setYear(String(etaplan.year));
			setName(etaplan.name);
			setNameTouched(true);
			setStartDate(etaplan.startDate ?? undefined);
			setEndDate(etaplan.endDate ?? undefined);
			setStatus(etaplan.status);
			setNotes(etaplan.notes ?? "");
		} else {
			setSemesterType("SS");
			setYear("");
			setName("");
			setNameTouched(false);
			setStartDate(undefined);
			setEndDate(undefined);
			setStatus("Aktiv");
			setNotes("");
		}
	}, [open, etaplan]);

	const suggestedName = year ? `${semesterType} ${year}` : "";
	const effectiveName = nameTouched ? name : suggestedName;

	const save = () => {
		const yearNum = Number.parseInt(year, 10);
		if (Number.isNaN(yearNum)) {
			toast.error("Gültiges Jahr erforderlich");
			return;
		}
		const finalName = (effectiveName || `${semesterType} ${year}`).trim();

		startTransition(async () => {
			const payload = {
				name: finalName,
				semesterType,
				year: yearNum,
				startDate: startDate ?? null,
				endDate: endDate ?? null,
				status,
				notes: notes.trim() || null,
			};
			const res = etaplan
				? await updateEtaplan(etaplan.id, payload)
				: await createEtaplan(payload);

			if (res.success) {
				toast.success(isEdit ? "Etatplan gespeichert" : "Etatplan erstellt");
				if ("warning" in res && res.warning) toast.warning(res.warning);
				const newId =
					"data" in res && res.data ? (res.data as Etaplan).id : etaplan?.id;
				onSaved(newId);
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
					<DialogTitle>
						{isEdit ? "Etatplan bearbeiten" : "Neuer Etatplan"}
					</DialogTitle>
				</DialogHeader>

				<div className="grid gap-4 py-2">
					<div className="grid grid-cols-2 gap-3">
						<div className="grid gap-2">
							<Label htmlFor="etaplan-semester">Semester</Label>
							<Select
								value={semesterType}
								onValueChange={(v) => setSemesterType(v as "SS" | "WS")}
							>
								<SelectTrigger id="etaplan-semester">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="SS">Sommersemester (SS)</SelectItem>
									<SelectItem value="WS">Wintersemester (WS)</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="etaplan-year">Jahr</Label>
							<Input
								id="etaplan-year"
								type="number"
								value={year}
								onChange={(e) => setYear(e.target.value)}
								placeholder="2026"
							/>
						</div>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="etaplan-name">Name</Label>
						<Input
							id="etaplan-name"
							value={effectiveName}
							onChange={(e) => {
								setNameTouched(true);
								setName(e.target.value);
							}}
							placeholder="SS 2026"
						/>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="grid gap-2">
							<Label>Beginn (optional)</Label>
							<DatePicker value={startDate} onChange={setStartDate} />
						</div>
						<div className="grid gap-2">
							<Label>Ende (optional)</Label>
							<DatePicker value={endDate} onChange={setEndDate} />
						</div>
					</div>

					{isEdit && (
						<div className="grid gap-2">
							<Label htmlFor="etaplan-status">Status</Label>
							<Select
								value={status}
								onValueChange={(v) => setStatus(v as "Aktiv" | "Abgeschlossen")}
							>
								<SelectTrigger id="etaplan-status">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="Aktiv">Aktiv</SelectItem>
									<SelectItem value="Abgeschlossen">Abgeschlossen</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}

					<div className="grid gap-2">
						<Label htmlFor="etaplan-notes">Notizen (optional)</Label>
						<Textarea
							id="etaplan-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
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
					<Button onClick={save} disabled={isPending || !year}>
						{isEdit ? "Speichern" : "Erstellen"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
