"use client";

import {
	Check,
	Copy,
	Inbox,
	MoreHorizontal,
	Pencil,
	Wallet,
	X,
} from "lucide-react";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { EmptyState } from "~/components/ui/empty-state";
import { Label } from "~/components/ui/label";
import { ReimbursementStatusBadge } from "~/components/ui/status-badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";
import { formatDate, formatEUR } from "~/lib/format";
import { formatIban } from "~/lib/iban";
import {
	approveReimbursement,
	markReimbursementPaid,
	type QueueReimbursement,
	rejectReimbursement,
} from "~/server/actions/cc-kasse/kostenerstattungen";
import { FilterChips } from "./KasseUi";
import { ReceiptLinks } from "./ReceiptLinks";
import {
	type EditingReimbursement,
	type KostenpunktOption,
	ReimbursementDialog,
	toEditing,
} from "./ReimbursementDialog";

type Filter =
	| "offen"
	| "Eingereicht"
	| "Genehmigt"
	| "Ausgezahlt"
	| "Abgelehnt"
	| "alle";

const isOpen = (r: QueueReimbursement) =>
	r.status === "Eingereicht" || r.status === "Genehmigt";

function submitterLabel(r: QueueReimbursement) {
	return r.source === "Direktbuchung"
		? "Direktbuchung"
		: (r.submitter?.name ?? "—");
}

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

	const matches = (r: QueueReimbursement, f: Filter) => {
		if (f === "alle") {
			return true;
		}
		if (f === "offen") {
			return isOpen(r);
		}
		return r.status === f;
	};
	const count = (f: Filter) => queue.filter((r) => matches(r, f)).length;
	const filtered = queue.filter((r) => matches(r, filter));
	const filteredSum = filtered.reduce((s, r) => s + r.amount, 0);

	const run = (
		action: () => Promise<{ success: boolean; error?: string }>,
		message = "Aktualisiert",
	) => {
		startTransition(async () => {
			const res = await action();
			if (res.success) {
				toast.success(message);
				router.refresh();
			} else {
				toast.error(res.error ?? "Fehler");
			}
		});
	};

	const confirmReject = () => {
		if (!rejectId) {
			return;
		}
		const id = rejectId;
		const reason = rejectReason;
		setRejectId(null);
		setRejectReason("");
		run(() => rejectReimbursement(id, reason), "Antrag abgelehnt");
	};

	const copyIban = async (iban: string) => {
		try {
			await navigator.clipboard.writeText(iban.replace(/\s+/g, ""));
			toast.success("IBAN kopiert");
		} catch {
			toast.error("Kopieren nicht möglich");
		}
	};

	const openReject = (id: string) => {
		setRejectId(id);
		setRejectReason("");
	};

	// The one action that moves a request forward — big and obvious.
	const primaryAction = (r: QueueReimbursement, full?: boolean) => {
		if (!isTreasury) {
			return null;
		}
		if (r.status === "Eingereicht") {
			return (
				<Button
					size="sm"
					className={full ? "h-9 flex-1" : undefined}
					disabled={isPending}
					onClick={() => run(() => approveReimbursement(r.id), "Genehmigt")}
				>
					<Check /> Genehmigen
				</Button>
			);
		}
		if (r.status === "Genehmigt") {
			return (
				<Button
					size="sm"
					className={full ? "h-9 flex-1" : undefined}
					disabled={isPending}
					onClick={() =>
						run(() => markReimbursementPaid(r.id), "Als ausgezahlt markiert")
					}
				>
					<Wallet /> Ausgezahlt
				</Button>
			);
		}
		return null;
	};

	const moreMenu = (r: QueueReimbursement, size: "sm" | "default" = "sm") =>
		isTreasury ? (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						size={size === "sm" ? "icon-sm" : "icon"}
						disabled={isPending}
						aria-label="Weitere Aktionen"
					>
						<MoreHorizontal />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => setEditing(toEditing(r))}>
						<Pencil /> Bearbeiten
					</DropdownMenuItem>
					{r.iban && (
						<DropdownMenuItem onClick={() => copyIban(r.iban ?? "")}>
							<Copy /> IBAN kopieren
						</DropdownMenuItem>
					)}
					{isOpen(r) && (
						<DropdownMenuItem
							variant="destructive"
							onClick={() => openReject(r.id)}
						>
							<X /> Ablehnen
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		) : null;

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<FilterChips<Filter>
					value={filter}
					onChange={setFilter}
					options={[
						{ value: "offen", label: "Offen", count: count("offen") },
						{
							value: "Eingereicht",
							label: "Eingereicht",
							count: count("Eingereicht"),
						},
						{
							value: "Genehmigt",
							label: "Genehmigt",
							count: count("Genehmigt"),
						},
						{ value: "Ausgezahlt", label: "Ausgezahlt" },
						{ value: "Abgelehnt", label: "Abgelehnt" },
						{ value: "alle", label: "Alle", count: queue.length },
					]}
				/>
				{filtered.length > 0 && (
					<p className="text-muted-foreground text-xs tabular-nums">
						{filtered.length} {filtered.length === 1 ? "Eintrag" : "Einträge"} ·
						Summe{" "}
						<span className="font-medium text-foreground">
							{formatEUR(filteredSum)}
						</span>
					</p>
				)}
			</div>

			{filtered.length === 0 ? (
				<EmptyState
					icon={<Inbox className="size-5" />}
					title={filter === "offen" ? "Alles erledigt" : "Keine Einträge"}
				>
					{filter === "offen"
						? "Es warten keine Anträge auf Bearbeitung."
						: "Für diesen Filter gibt es keine Anträge."}
				</EmptyState>
			) : (
				<>
					{/* Mobile: cards */}
					<ul className="space-y-3 md:hidden">
						{filtered.map((r) => (
							<li
								key={r.id}
								className="overflow-hidden rounded-xl border bg-card shadow-xs"
							>
								<div className="space-y-2 p-4">
									<div className="flex items-start justify-between gap-3">
										<div className="font-bold text-xl tabular-nums tracking-tight">
											{formatEUR(r.amount)}
										</div>
										<ReimbursementStatusBadge status={r.status} />
									</div>
									<p className="text-sm leading-snug">{r.description}</p>
									<p className="text-muted-foreground text-xs">
										{r.kostenpunkt?.category}
										{r.kostenpunkt?.category && " › "}
										<span className="text-foreground">
											{r.kostenpunkt?.name ?? "—"}
										</span>
									</p>
									<p className="text-muted-foreground text-xs">
										{formatDate(r.expenseDate)} · {submitterLabel(r)}
									</p>

									{r.status === "Abgelehnt" && r.rejectionReason && (
										<p className="rounded-lg bg-danger-muted px-3 py-2 text-danger-muted-foreground text-xs">
											{r.rejectionReason}
										</p>
									)}

									<div className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
										<div className="min-w-0">
											<div className="truncate text-sm">{r.recipientName}</div>
											{r.iban && (
												<div className="truncate font-mono text-muted-foreground text-xs">
													{formatIban(r.iban)}
												</div>
											)}
										</div>
										{r.iban && (
											<Button
												variant="ghost"
												size="icon-sm"
												aria-label="IBAN kopieren"
												onClick={() => copyIban(r.iban ?? "")}
											>
												<Copy />
											</Button>
										)}
									</div>

									<ReceiptLinks
										receipts={r.receipts}
										legacyUrl={r.receiptUrl}
										legacyName={r.receiptName}
									/>
								</div>
								{isTreasury && (
									<div className="flex items-center gap-2 border-t bg-muted/20 px-4 py-2.5">
										{primaryAction(r, true) ?? <span className="flex-1" />}
										{moreMenu(r, "default")}
									</div>
								)}
							</li>
						))}
					</ul>

					{/* Desktop: table */}
					<div className="hidden overflow-hidden rounded-xl border bg-card shadow-xs md:block">
						<Table>
							<TableHeader>
								<TableRow className="bg-muted/40 hover:bg-muted/40">
									<TableHead className="pl-4">Antrag</TableHead>
									<TableHead>Empfänger</TableHead>
									<TableHead>Beleg</TableHead>
									<TableHead className="text-right">Betrag</TableHead>
									<TableHead>Status</TableHead>
									{isTreasury && <TableHead className="w-0" />}
								</TableRow>
							</TableHeader>
							<TableBody>
								{filtered.map((r) => (
									<TableRow key={r.id} className="align-top">
										<TableCell className="max-w-[320px] whitespace-normal pl-4">
											<div className="font-medium">{r.description}</div>
											<div className="text-muted-foreground text-xs">
												{r.kostenpunkt?.category} › {r.kostenpunkt?.name ?? "—"}
											</div>
											<div className="text-muted-foreground text-xs">
												{formatDate(r.expenseDate)} · {submitterLabel(r)}
											</div>
											{r.status === "Abgelehnt" && r.rejectionReason && (
												<div className="mt-1 text-destructive text-xs">
													{r.rejectionReason}
												</div>
											)}
										</TableCell>
										<TableCell>
											<div>{r.recipientName}</div>
											{r.iban && (
												<button
													type="button"
													onClick={() => copyIban(r.iban ?? "")}
													className="group/iban inline-flex items-center gap-1 font-mono text-muted-foreground text-xs hover:text-foreground"
													title="IBAN kopieren"
												>
													{formatIban(r.iban)}
													<Copy className="size-3 opacity-0 transition-opacity group-hover/iban:opacity-100" />
												</button>
											)}
										</TableCell>
										<TableCell>
											<ReceiptLinks
												receipts={r.receipts}
												legacyUrl={r.receiptUrl}
												legacyName={r.receiptName}
											/>
										</TableCell>
										<TableCell className="text-right font-semibold tabular-nums">
											{formatEUR(r.amount)}
										</TableCell>
										<TableCell>
											<ReimbursementStatusBadge status={r.status} />
										</TableCell>
										{isTreasury && (
											<TableCell>
												<div className="flex justify-end gap-1.5">
													{primaryAction(r)}
													{moreMenu(r)}
												</div>
											</TableCell>
										)}
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
					if (!o) {
						setRejectId(null);
					}
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
					if (!o) {
						setEditing(null);
					}
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
