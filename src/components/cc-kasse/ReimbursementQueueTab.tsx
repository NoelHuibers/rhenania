"use client";

import { Check, Pencil, Wallet, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
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
import { Textarea } from "~/components/ui/textarea";
import { formatEur } from "~/lib/cc-kasse-format";
import { formatIban } from "~/lib/iban";
import {
	approveReimbursement,
	markReimbursementPaid,
	type QueueReimbursement,
	rejectReimbursement,
} from "~/server/actions/cc-kasse/kostenerstattungen";
import { ReceiptLinks } from "./ReceiptLinks";
import {
	type EditingReimbursement,
	type KostenpunktOption,
	ReimbursementDialog,
	toEditing,
} from "./ReimbursementDialog";
import { ReimbursementStatusBadge } from "./ReimbursementStatusBadge";

type Filter =
	| "offen"
	| "Eingereicht"
	| "Genehmigt"
	| "Ausgezahlt"
	| "Abgelehnt"
	| "alle";

export function ReimbursementQueueTab({
	queue,
	isTreasury,
	kostenpunkte,
}: {
	queue: QueueReimbursement[];
	isTreasury: boolean;
	kostenpunkte: KostenpunktOption[];
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [filter, setFilter] = useState<Filter>("offen");
	const [rejectId, setRejectId] = useState<string | null>(null);
	const [rejectReason, setRejectReason] = useState("");
	const [editing, setEditing] = useState<EditingReimbursement | null>(null);

	const filtered = queue.filter((r) => {
		if (filter === "alle") return true;
		if (filter === "offen")
			return r.status === "Eingereicht" || r.status === "Genehmigt";
		return r.status === filter;
	});

	const run = (action: () => Promise<{ success: boolean; error?: string }>) => {
		startTransition(async () => {
			const res = await action();
			if (res.success) {
				toast.success("Aktualisiert");
				router.refresh();
			} else {
				toast.error(res.error ?? "Fehler");
			}
		});
	};

	const confirmReject = () => {
		if (!rejectId) return;
		const id = rejectId;
		const reason = rejectReason;
		setRejectId(null);
		setRejectReason("");
		run(() => rejectReimbursement(id, reason));
	};

	const rowActions = (r: QueueReimbursement) =>
		isTreasury ? (
			<div className="flex flex-wrap justify-end gap-1">
				<Button
					variant="ghost"
					size="sm"
					disabled={isPending}
					onClick={() => setEditing(toEditing(r))}
				>
					<Pencil className="h-4 w-4" />
				</Button>
				{r.status === "Eingereicht" && (
					<Button
						variant="outline"
						size="sm"
						disabled={isPending}
						onClick={() => run(() => approveReimbursement(r.id))}
					>
						<Check className="mr-1 h-4 w-4" /> Genehmigen
					</Button>
				)}
				{r.status === "Genehmigt" && (
					<Button
						variant="outline"
						size="sm"
						disabled={isPending}
						onClick={() => run(() => markReimbursementPaid(r.id))}
					>
						<Wallet className="mr-1 h-4 w-4" /> Auszahlen
					</Button>
				)}
				{(r.status === "Eingereicht" || r.status === "Genehmigt") && (
					<Button
						variant="ghost"
						size="sm"
						disabled={isPending}
						onClick={() => {
							setRejectId(r.id);
							setRejectReason("");
						}}
					>
						<X className="h-4 w-4" />
					</Button>
				)}
			</div>
		) : null;

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
					<SelectTrigger className="w-full sm:w-[200px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="offen">Offen (zu bearbeiten)</SelectItem>
						<SelectItem value="Eingereicht">Eingereicht</SelectItem>
						<SelectItem value="Genehmigt">Genehmigt</SelectItem>
						<SelectItem value="Ausgezahlt">Ausgezahlt</SelectItem>
						<SelectItem value="Abgelehnt">Abgelehnt</SelectItem>
						<SelectItem value="alle">Alle</SelectItem>
					</SelectContent>
				</Select>
				<span className="text-muted-foreground text-sm">
					{filtered.length} Einträge
				</span>
			</div>

			{filtered.length === 0 ? (
				<p className="py-8 text-center text-muted-foreground text-sm">
					Keine Einträge.
				</p>
			) : (
				<>
					{/* Mobile: stacked cards */}
					<div className="space-y-3 md:hidden">
						{filtered.map((r) => (
							<div key={r.id} className="space-y-2 rounded-lg border p-3">
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<div className="text-muted-foreground text-xs">
											{r.kostenpunkt?.category}
										</div>
										<div className="font-medium">
											{r.kostenpunkt?.name ?? "—"}
										</div>
									</div>
									<ReimbursementStatusBadge status={r.status} />
								</div>
								<div className="flex items-center justify-between gap-2 text-sm">
									<span className="text-muted-foreground">
										{new Date(r.expenseDate).toLocaleDateString("de-DE")} ·{" "}
										{r.source === "Direktbuchung"
											? "Direktbuchung"
											: (r.submitter?.name ?? "—")}
									</span>
									<span className="font-semibold">{formatEur(r.amount)}</span>
								</div>
								<p className="text-muted-foreground text-sm">{r.description}</p>
								<div className="text-sm">
									{r.recipientName}
									{r.iban && (
										<span className="block text-muted-foreground text-xs">
											{formatIban(r.iban)}
										</span>
									)}
								</div>
								<div className="flex items-center justify-between gap-2">
									<ReceiptLinks
										receipts={r.receipts}
										legacyUrl={r.receiptUrl}
										legacyName={r.receiptName}
									/>
									{rowActions(r)}
								</div>
							</div>
						))}
					</div>

					{/* Desktop: table */}
					<div className="hidden md:block">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Datum</TableHead>
									<TableHead>Von</TableHead>
									<TableHead>Kostenpunkt</TableHead>
									<TableHead>Empfänger</TableHead>
									<TableHead className="text-right">Betrag</TableHead>
									<TableHead>Beleg</TableHead>
									<TableHead>Status</TableHead>
									{isTreasury && (
										<TableHead className="text-right">Aktionen</TableHead>
									)}
								</TableRow>
							</TableHeader>
							<TableBody>
								{filtered.map((r) => (
									<TableRow key={r.id}>
										<TableCell className="whitespace-nowrap">
											{new Date(r.expenseDate).toLocaleDateString("de-DE")}
										</TableCell>
										<TableCell>
											{r.source === "Direktbuchung"
												? "Direktbuchung"
												: (r.submitter?.name ?? "—")}
										</TableCell>
										<TableCell>
											<span className="text-muted-foreground text-xs">
												{r.kostenpunkt?.category}
											</span>
											<br />
											{r.kostenpunkt?.name ?? "—"}
											<span className="block max-w-[200px] truncate text-muted-foreground text-xs">
												{r.description}
											</span>
										</TableCell>
										<TableCell>
											{r.recipientName}
											{r.iban && (
												<span className="block text-muted-foreground text-xs">
													{formatIban(r.iban)}
												</span>
											)}
										</TableCell>
										<TableCell className="text-right font-medium">
											{formatEur(r.amount)}
										</TableCell>
										<TableCell>
											<ReceiptLinks
												receipts={r.receipts}
												legacyUrl={r.receiptUrl}
												legacyName={r.receiptName}
											/>
										</TableCell>
										<TableCell>
											<ReimbursementStatusBadge status={r.status} />
										</TableCell>
										{isTreasury && <TableCell>{rowActions(r)}</TableCell>}
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</>
			)}

			<Dialog
				open={rejectId !== null}
				onOpenChange={(o) => {
					if (!o) setRejectId(null);
				}}
			>
				<DialogContent className="sm:max-w-[420px]">
					<DialogHeader>
						<DialogTitle>Antrag ablehnen</DialogTitle>
					</DialogHeader>
					<div className="grid gap-2 py-2">
						<Label htmlFor="reject-reason">Begründung</Label>
						<Textarea
							id="reject-reason"
							value={rejectReason}
							onChange={(e) => setRejectReason(e.target.value)}
							placeholder="Warum wird der Antrag abgelehnt?"
							rows={3}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRejectId(null)}>
							Abbrechen
						</Button>
						<Button
							variant="destructive"
							disabled={isPending || !rejectReason.trim()}
							onClick={confirmReject}
						>
							Ablehnen
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<ReimbursementDialog
				open={editing !== null}
				onOpenChange={(o) => {
					if (!o) setEditing(null);
				}}
				kostenpunkte={kostenpunkte}
				mode="direct"
				editing={editing}
				onSaved={() => {
					setEditing(null);
					router.refresh();
				}}
			/>
		</div>
	);
}
