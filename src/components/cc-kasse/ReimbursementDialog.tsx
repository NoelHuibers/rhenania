"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { useTenantSlug } from "~/components/TenantProvider";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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
import { uploadReceipt } from "~/lib/receipt-upload";
import {
	createDirectBooking,
	submitReimbursement,
	updateMyReimbursement,
	updateReimbursement,
} from "~/server/actions/cc-kasse/kostenerstattungen";
import { setMyPaymentInfo } from "~/server/actions/cc-kasse/paymentInfo";
import type {
	EditingReimbursement,
	KostenpunktOption,
	ReceiptFile,
} from "./reimbursement-dialog/editing";
import { ReceiptsField } from "./reimbursement-dialog/ReceiptsField";

export {
	type EditingReimbursement,
	type KostenpunktOption,
	toEditing,
} from "./reimbursement-dialog/editing";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	kostenpunkte: KostenpunktOption[];
	mode: "member" | "direct";
	defaultPaymentInfo?: { accountHolder: string; iban: string } | null;
	editing?: EditingReimbursement | null;
	onSaved: () => void;
};

export function ReimbursementDialog({
	open,
	onOpenChange,
	kostenpunkte,
	mode,
	defaultPaymentInfo,
	editing,
	onSaved,
}: Props) {
	const tenantSlug = useTenantSlug();
	const isEdit = !!editing;
	const [kostenpunktId, setKostenpunktId] = useState("");
	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");
	const [recipientName, setRecipientName] = useState("");
	const [iban, setIban] = useState("");
	const [expenseDate, setExpenseDate] = useState<Date | undefined>();
	const [saveDefault, setSaveDefault] = useState(false);
	const [existingReceipts, setExistingReceipts] = useState<ReceiptFile[]>([]);
	const [files, setFiles] = useState<File[]>([]);
	const [uploadIndex, setUploadIndex] = useState(0);
	const [progress, setProgress] = useState(0);
	const [isUploading, setIsUploading] = useState(false);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (!open) {
			return;
		}
		if (editing) {
			setKostenpunktId(editing.kostenpunktId);
			setAmount(String(editing.amount));
			setDescription(editing.description);
			setRecipientName(editing.recipientName);
			setIban(editing.iban ?? "");
			setExpenseDate(new Date(editing.expenseDate));
			setExistingReceipts(editing.receipts);
		} else {
			setKostenpunktId("");
			setAmount("");
			setDescription("");
			setRecipientName(
				mode === "member" ? (defaultPaymentInfo?.accountHolder ?? "") : "",
			);
			setIban(mode === "member" ? (defaultPaymentInfo?.iban ?? "") : "");
			setExpenseDate(mode === "direct" ? new Date() : undefined);
			setExistingReceipts([]);
		}
		setSaveDefault(false);
		setFiles([]);
		setProgress(0);
		setUploadIndex(0);
	}, [open, mode, defaultPaymentInfo, editing]);

	// Make sure the edited row's Kostenpunkt is selectable even if it belongs to
	// a plan that is no longer in the bookable list.
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

	const num = (s: string) => {
		const v = parseDecimalInput(s);
		return Number.isFinite(v) ? v : 0;
	};

	const removeFile = (idx: number) =>
		setFiles((prev) => prev.filter((_, i) => i !== idx));
	const removeExisting = (idx: number) =>
		setExistingReceipts((prev) => prev.filter((_, i) => i !== idx));

	const isSubmitting = isUploading || isPending;

	const submit = () => {
		if (!kostenpunktId) {
			toast.error("Bitte einen Kostenpunkt wählen");
			return;
		}
		const amt = num(amount);
		if (amt <= 0) {
			toast.error("Gültiger Betrag erforderlich");
			return;
		}
		if (!description.trim()) {
			toast.error("Beschreibung erforderlich");
			return;
		}
		if (!recipientName.trim()) {
			toast.error(
				mode === "direct"
					? "Empfänger erforderlich"
					: "Kontoinhaber erforderlich",
			);
			return;
		}
		if (mode === "member" && !iban.trim()) {
			toast.error("IBAN erforderlich");
			return;
		}
		if (mode === "direct" && !expenseDate) {
			toast.error("Datum erforderlich");
			return;
		}

		void (async () => {
			const receipts: ReceiptFile[] = [...existingReceipts];
			if (files.length) {
				setIsUploading(true);
				try {
					for (let i = 0; i < files.length; i++) {
						setUploadIndex(i);
						setProgress(0);
						// biome-ignore lint/style/noNonNullAssertion: index in range
						const f = files[i]!;
						const url = await uploadReceipt(f, {
							tenantSlug,
							onProgress: setProgress,
						});
						receipts.push({ url, name: f.name });
					}
				} catch (err) {
					toast.error(
						err instanceof Error ? err.message : "Upload fehlgeschlagen",
					);
					setIsUploading(false);
					return;
				}
				setIsUploading(false);
			}

			startTransition(async () => {
				let res: { success: boolean; error?: string };
				if (editing) {
					res =
						mode === "direct"
							? await updateReimbursement(editing.id, {
									kostenpunktId,
									description: description.trim(),
									amount: amt,
									recipientName: recipientName.trim(),
									iban: iban.trim() || null,
									expenseDate,
									receipts,
								})
							: await updateMyReimbursement(editing.id, {
									kostenpunktId,
									description: description.trim(),
									amount: amt,
									recipientName: recipientName.trim(),
									iban: iban.trim(),
									receipts,
								});
				} else if (mode === "direct") {
					res = await createDirectBooking({
						kostenpunktId,
						description: description.trim(),
						amount: amt,
						recipientName: recipientName.trim(),
						iban: iban.trim() || null,
						receipts,
						// biome-ignore lint/style/noNonNullAssertion: guarded above
						expenseDate: expenseDate!,
					});
				} else {
					res = await submitReimbursement({
						kostenpunktId,
						description: description.trim(),
						amount: amt,
						recipientName: recipientName.trim(),
						iban: iban.trim(),
						receipts,
					});
				}

				if (res.success) {
					if (mode === "member" && saveDefault) {
						await setMyPaymentInfo({
							accountHolder: recipientName.trim(),
							iban: iban.trim(),
						});
					}
					toast.success(
						isEdit
							? "Gespeichert"
							: mode === "direct"
								? "Buchung erstellt"
								: "Antrag eingereicht",
					);
					onSaved();
					onOpenChange(false);
				} else {
					toast.error(res.error);
				}
			});
		})();
	};

	const title = isEdit
		? "Kostenerstattung bearbeiten"
		: mode === "direct"
			? "Direktbuchung / Backfill"
			: "Neue Kostenerstattung";

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] flex-col sm:max-w-[520px]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>

				<div className="flex-1 space-y-4 overflow-y-auto px-1 py-2">
					<div className="grid gap-2">
						<Label htmlFor="re-kp">Kostenpunkt</Label>
						<Select value={kostenpunktId} onValueChange={setKostenpunktId}>
							<SelectTrigger id="re-kp">
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
							<Label htmlFor="re-amount">Betrag (€)</Label>
							<Input
								id="re-amount"
								inputMode="decimal"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
								placeholder="0,00"
							/>
						</div>
						{mode === "direct" && (
							<div className="grid gap-2">
								<Label>Datum</Label>
								<DatePicker value={expenseDate} onChange={setExpenseDate} />
							</div>
						)}
					</div>

					<div className="grid gap-2">
						<Label htmlFor="re-desc">Beschreibung</Label>
						<Textarea
							id="re-desc"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Wofür war die Ausgabe?"
							rows={2}
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="re-recipient">
							{mode === "direct" ? "Empfänger" : "Kontoinhaber"}
						</Label>
						<Input
							id="re-recipient"
							value={recipientName}
							onChange={(e) => setRecipientName(e.target.value)}
							placeholder={
								mode === "direct" ? "z.B. Getränkemarkt" : "Max Mustermann"
							}
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="re-iban">
							IBAN{mode === "direct" ? " (optional)" : ""}
						</Label>
						<Input
							id="re-iban"
							value={iban}
							onChange={(e) => setIban(e.target.value)}
							placeholder="DE00 0000 0000 0000 0000 00"
						/>
					</div>

					{mode === "member" && (
						<div className="flex items-center gap-2">
							<Checkbox
								id="re-savedefault"
								checked={saveDefault}
								onCheckedChange={(c) => setSaveDefault(c === true)}
							/>
							<Label htmlFor="re-savedefault" className="font-normal">
								Als Standard im Profil speichern
							</Label>
						</div>
					)}

					<ReceiptsField
						mode={mode}
						existingReceipts={existingReceipts}
						files={files}
						isSubmitting={isSubmitting}
						isUploading={isUploading}
						progress={progress}
						uploadIndex={uploadIndex}
						onAddFiles={(valid) => setFiles((prev) => [...prev, ...valid])}
						onRemoveFile={removeFile}
						onRemoveExisting={removeExisting}
					/>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSubmitting}
					>
						Abbrechen
					</Button>
					<Button onClick={submit} disabled={isSubmitting}>
						{isSubmitting
							? "Wird gespeichert…"
							: isEdit
								? "Speichern"
								: mode === "direct"
									? "Buchen"
									: "Einreichen"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
