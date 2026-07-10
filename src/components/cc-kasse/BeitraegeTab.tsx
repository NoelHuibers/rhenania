"use client";

import {
	BellRing,
	Check,
	FileText,
	Mail,
	Plus,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { formatEur } from "~/lib/cc-kasse-format";
import { downloadBase64, PDF_MIME } from "~/lib/file-download";
import type { Etaplan } from "~/server/actions/cc-kasse/etaplans";
import {
	type BeitragRun,
	type ChargeListItem,
	type ChargesForRun,
	deleteBeitragRun,
	downloadChargePdf,
	markChargePaid,
	markChargeUnpaid,
	regenerateCharges,
	sendBeitragEmails,
	sendMahnungen,
} from "~/server/actions/members/semesterbeitrag";
import { BeitragRunDialog } from "./BeitragRunDialog";

type KpOption = { id: string; name: string; category: string };

function chargeBadge(c: ChargeListItem) {
	if (c.status === "Bezahlt")
		return (
			<Badge
				variant="outline"
				className="border-emerald-200 bg-emerald-50 font-medium text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
			>
				Bezahlt
			</Badge>
		);
	if (c.status === "Gemahnt")
		return (
			<Badge
				variant="outline"
				className="border-red-200 bg-red-50 font-medium text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
			>
				Gemahnt
			</Badge>
		);
	if (c.ueberfaellig)
		return (
			<Badge
				variant="outline"
				className="border-amber-200 bg-amber-50 font-medium text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
			>
				Überfällig
			</Badge>
		);
	return <Badge variant="secondary">Offen</Badge>;
}

export function BeitraegeTab({
	runs,
	selected,
	etaplan,
	kostenpunkte,
	onNavigateRun,
}: {
	runs: BeitragRun[];
	selected: ChargesForRun | null;
	etaplan: Etaplan | null;
	kostenpunkte: KpOption[];
	onNavigateRun: (runId: string) => void;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [createOpen, setCreateOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const run = selected?.run ?? null;
	const charges = selected?.charges ?? [];
	const paid = charges.filter((c) => c.status === "Bezahlt").length;
	const totalPaid = charges
		.filter((c) => c.status === "Bezahlt")
		.reduce((s, c) => s + c.total, 0);

	const runAction = (
		action: () => Promise<{ success: boolean; error?: string }>,
	) =>
		startTransition(async () => {
			const res = await action();
			if (res.success) {
				toast.success("Aktualisiert");
				router.refresh();
			} else {
				toast.error(res.error ?? "Fehler");
			}
		});

	const sendEmails = () => {
		if (!run) return;
		startTransition(async () => {
			const res = await sendBeitragEmails(run.id);
			if (res.success) {
				toast.success(
					`${res.emailed} per Email, ${res.lettersPending} als Brief${
						res.failed ? `, ${res.failed} fehlgeschlagen` : ""
					}`,
				);
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	const sendMahn = () => {
		if (!run) return;
		startTransition(async () => {
			const res = await sendMahnungen(run.id);
			if (res.success) {
				toast.success(
					`${res.processed} gemahnt (${res.emailed} Email, ${res.lettersPending} Brief)`,
				);
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	const confirmDeleteRun = () => {
		if (!run) return;
		const id = run.id;
		setDeleteOpen(false);
		startTransition(async () => {
			const res = await deleteBeitragRun(id);
			if (res.success) {
				toast.success("Beitragslauf gelöscht");
				router.refresh();
			} else {
				toast.error(res.error ?? "Fehler");
			}
		});
	};

	const dlPdf = (chargeId: string, isMahnung: boolean) =>
		startTransition(async () => {
			const res = await downloadChargePdf(chargeId, { isMahnung });
			if (res.success) downloadBase64(res.base64, res.fileName, PDF_MIME);
			else toast.error(res.error);
		});

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				{runs.length > 0 ? (
					<Select value={run?.id ?? ""} onValueChange={onNavigateRun}>
						<SelectTrigger className="w-full sm:w-[260px]">
							<SelectValue placeholder="Beitragslauf wählen" />
						</SelectTrigger>
						<SelectContent>
							{runs.map((r) => (
								<SelectItem key={r.id} value={r.id}>
									{r.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<span className="text-muted-foreground text-sm">
						Noch kein Beitragslauf.
					</span>
				)}
				<Button
					size="sm"
					onClick={() => setCreateOpen(true)}
					disabled={!etaplan}
					className="w-full sm:w-auto"
				>
					<Plus className="mr-1 h-4 w-4" /> Neuer Beitragslauf
				</Button>
			</div>

			{!etaplan && (
				<p className="text-muted-foreground text-sm">
					Lege zuerst einen Etatplan an, um Beiträge zu erstellen.
				</p>
			)}

			{run && (
				<>
					<div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md border p-3 text-sm">
						<span>
							Fällig: <b>{new Date(run.dueDate).toLocaleDateString("de-DE")}</b>
						</span>
						<span>
							{paid}/{charges.length} bezahlt
						</span>
						<span>
							Eingenommen: <b>{formatEur(totalPaid)}</b>
						</span>
					</div>

					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={sendEmails}
							disabled={isPending || charges.length === 0}
						>
							<Mail className="mr-1 h-4 w-4" /> E-Mails senden
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={sendMahn}
							disabled={isPending || charges.length === 0}
						>
							<BellRing className="mr-1 h-4 w-4" /> Mahnungen senden
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => runAction(() => regenerateCharges(run.id))}
							disabled={isPending}
						>
							<RefreshCw className="mr-1 h-4 w-4" /> Mitglieder aktualisieren
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setDeleteOpen(true)}
							disabled={isPending}
							className="text-destructive hover:text-destructive"
						>
							<Trash2 className="mr-1 h-4 w-4" /> Lauf löschen
						</Button>
					</div>

					{charges.length === 0 ? (
						<p className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
							Keine beitragspflichtigen Mitglieder (Fuchs / CB / IaCB).
						</p>
					) : (
						<div className="space-y-2">
							{charges.map((c) => (
								<div
									key={c.id}
									className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
								>
									<div className="min-w-0">
										<div className="font-medium">{c.memberName}</div>
										<div className="text-muted-foreground text-xs">
											{formatEur(c.total)}
											{c.mahnungAmount > 0 &&
												` (inkl. ${formatEur(c.mahnungAmount)} Mahngebühr)`}
											{!c.hasEmail && " · Brief nötig"}
											{c.emailSentAt && " · Email gesendet"}
										</div>
									</div>
									<div className="flex flex-wrap items-center justify-end gap-2">
										{chargeBadge(c)}
										{c.status === "Bezahlt" ? (
											<Button
												variant="ghost"
												size="sm"
												disabled={isPending}
												onClick={() => runAction(() => markChargeUnpaid(c.id))}
											>
												Zurücksetzen
											</Button>
										) : (
											<Button
												variant="outline"
												size="sm"
												disabled={isPending}
												onClick={() => runAction(() => markChargePaid(c.id))}
											>
												<Check className="mr-1 h-4 w-4" /> Bezahlt
											</Button>
										)}
										<Button
											variant="ghost"
											size="icon"
											disabled={isPending}
											title="PDF herunterladen"
											onClick={() => dlPdf(c.id, c.mahnungAmount > 0)}
										>
											<FileText className="h-4 w-4" />
										</Button>
									</div>
								</div>
							))}
						</div>
					)}
				</>
			)}

			{etaplan && (
				<BeitragRunDialog
					open={createOpen}
					onOpenChange={setCreateOpen}
					etaplan={etaplan}
					kostenpunkte={kostenpunkte}
					onSaved={(id) => {
						if (id) onNavigateRun(id);
						else router.refresh();
					}}
				/>
			)}

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Beitragslauf löschen?</AlertDialogTitle>
						<AlertDialogDescription>
							„{run?.name}“ und alle zugehörigen offenen Beiträge werden
							gelöscht. Das ist nur möglich, solange noch kein Beitrag bezahlt
							wurde.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Abbrechen</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDeleteRun}>
							Löschen
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
