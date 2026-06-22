"use client";

import { Upload, X } from "lucide-react";
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
import { Progress } from "~/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { uploadReceipt, validateReceiptFile } from "~/lib/receipt-upload";
import {
	createDirectBooking,
	submitReimbursement,
} from "~/server/actions/cc-kasse/kostenerstattungen";
import { setMyPaymentInfo } from "~/server/actions/cc-kasse/paymentInfo";

export type KostenpunktOption = {
	id: string;
	name: string;
	category: string;
};

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	kostenpunkte: KostenpunktOption[];
	mode: "member" | "direct";
	defaultPaymentInfo?: { accountHolder: string; iban: string } | null;
	onSaved: () => void;
};

export function ReimbursementDialog({
	open,
	onOpenChange,
	kostenpunkte,
	mode,
	defaultPaymentInfo,
	onSaved,
}: Props) {
	const tenantSlug = useTenantSlug();
	const [kostenpunktId, setKostenpunktId] = useState("");
	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");
	const [recipientName, setRecipientName] = useState("");
	const [iban, setIban] = useState("");
	const [expenseDate, setExpenseDate] = useState<Date | undefined>();
	const [saveDefault, setSaveDefault] = useState(false);
	const [files, setFiles] = useState<File[]>([]);
	const [uploadIndex, setUploadIndex] = useState(0);
	const [progress, setProgress] = useState(0);
	const [isUploading, setIsUploading] = useState(false);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (!open) return;
		setKostenpunktId("");
		setAmount("");
		setDescription("");
		setRecipientName(
			mode === "member" ? (defaultPaymentInfo?.accountHolder ?? "") : "",
		);
		setIban(mode === "member" ? (defaultPaymentInfo?.iban ?? "") : "");
		setExpenseDate(mode === "direct" ? new Date() : undefined);
		setSaveDefault(false);
		setFiles([]);
		setProgress(0);
		setUploadIndex(0);
	}, [open, mode, defaultPaymentInfo]);

	const num = (s: string) => {
		const v = Number.parseFloat(s.replace(",", "."));
		return Number.isFinite(v) ? v : 0;
	};

	const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selected = Array.from(e.target.files ?? []);
		e.target.value = "";
		const valid: File[] = [];
		for (const f of selected) {
			try {
				validateReceiptFile(f);
				valid.push(f);
			} catch (err) {
				toast.error(
					`${f.name}: ${err instanceof Error ? err.message : "ungültig"}`,
				);
			}
		}
		if (valid.length) setFiles((prev) => [...prev, ...valid]);
	};

	const removeFile = (idx: number) =>
		setFiles((prev) => prev.filter((_, i) => i !== idx));

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
			const receipts: { url: string; name: string }[] = [];
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
				const res =
					mode === "direct"
						? await createDirectBooking({
								kostenpunktId,
								description: description.trim(),
								amount: amt,
								recipientName: recipientName.trim(),
								iban: iban.trim() || null,
								receipts,
								// biome-ignore lint/style/noNonNullAssertion: guarded above
								expenseDate: expenseDate!,
							})
						: await submitReimbursement({
								kostenpunktId,
								description: description.trim(),
								amount: amt,
								recipientName: recipientName.trim(),
								iban: iban.trim(),
								receipts,
							});

				if (res.success) {
					if (mode === "member" && saveDefault) {
						await setMyPaymentInfo({
							accountHolder: recipientName.trim(),
							iban: iban.trim(),
						});
					}
					toast.success(
						mode === "direct" ? "Buchung erstellt" : "Antrag eingereicht",
					);
					onSaved();
					onOpenChange(false);
				} else {
					toast.error(res.error);
				}
			});
		})();
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] flex-col sm:max-w-[520px]">
				<DialogHeader>
					<DialogTitle>
						{mode === "direct"
							? "Direktbuchung / Backfill"
							: "Neue Kostenerstattung"}
					</DialogTitle>
				</DialogHeader>

				<div className="flex-1 space-y-4 overflow-y-auto px-1 py-2">
					<div className="grid gap-2">
						<Label htmlFor="re-kp">Kostenpunkt</Label>
						<Select value={kostenpunktId} onValueChange={setKostenpunktId}>
							<SelectTrigger id="re-kp">
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
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="grid gap-2">
							<Label htmlFor="re-amount">Betrag (€)</Label>
							<Input
								id="re-amount"
								type="number"
								step="0.01"
								min="0"
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

					<div className="grid gap-2">
						<Label>
							Belege (PDF/Bild{mode === "direct" ? ", optional" : ""})
						</Label>
						{files.length > 0 && (
							<div className="space-y-1">
								{files.map((f, i) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: file list is order-stable within the dialog session
										key={`${f.name}-${i}`}
										className="flex items-center gap-2 rounded-md border p-2"
									>
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium text-sm">{f.name}</p>
											<p className="text-muted-foreground text-xs">
												{(f.size / 1024 / 1024).toFixed(2)} MB
											</p>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											disabled={isSubmitting}
											onClick={() => removeFile(i)}
										>
											<X className="h-4 w-4" />
										</Button>
									</div>
								))}
							</div>
						)}
						<Input
							id="re-file"
							type="file"
							multiple
							accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
							onChange={handleFiles}
							className="hidden"
						/>
						<Button
							type="button"
							variant="outline"
							onClick={() => document.getElementById("re-file")?.click()}
							disabled={isSubmitting}
							className="w-full"
						>
							<Upload className="mr-2 h-4 w-4" />
							{files.length ? "Weitere Belege hinzufügen" : "Belege auswählen"}
						</Button>
						{isUploading && (
							<div className="space-y-1">
								<Progress value={progress} />
								<p className="text-muted-foreground text-xs">
									Beleg {uploadIndex + 1} von {files.length} wird hochgeladen…{" "}
									{Math.round(progress)}%
								</p>
							</div>
						)}
					</div>
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
							: mode === "direct"
								? "Buchen"
								: "Einreichen"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
