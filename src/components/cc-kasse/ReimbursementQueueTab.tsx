"use client";

import { Check, Wallet, X } from "lucide-react";
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
}: {
	queue: QueueReimbursement[];
	isTreasury: boolean;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [filter, setFilter] = useState<Filter>("offen");
	const [rejectId, setRejectId] = useState<string | null>(null);
	const [rejectReason, setRejectReason] = useState("");

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

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
					<SelectTrigger className="w-[200px]">
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
								{isTreasury && (
									<TableCell>
										<div className="flex justify-end gap-1">
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
											{(r.status === "Eingereicht" ||
												r.status === "Genehmigt") && (
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
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
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
		</div>
	);
}
