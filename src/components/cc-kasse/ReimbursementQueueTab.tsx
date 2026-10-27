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
import { ChipGroup } from "~/components/ui/chip-group";
import { DataList, type DataListColumn } from "~/components/ui/data-list";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { EmptyState } from "~/components/ui/empty-state";
import { ReimbursementStatusBadge } from "~/components/ui/status-badge";
import { formatDate, formatEUR } from "~/lib/format";
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
import { RejectReimbursementDialog } from "./RejectReimbursementDialog";

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
	const primaryAction = (r: QueueReimbursement) => {
		if (!isTreasury) {
			return null;
		}
		if (r.status === "Eingereicht") {
			return (
				<Button
					size="sm"
					className="max-md:h-9 max-md:flex-1"
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
					className="max-md:h-9 max-md:flex-1"
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

	const moreMenu = (r: QueueReimbursement) => (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="icon-sm"
					className="max-md:size-9"
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
	);

	const columns: DataListColumn<QueueReimbursement>[] = [
		{
			id: "request",
			header: "Antrag",
			cell: ({ row: { original: r } }) => (
				<>
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
				</>
			),
			meta: {
				mobile: "title",
				className: "md:pl-4",
				cellClassName:
					"max-md:font-normal md:max-w-[320px] md:whitespace-normal",
			},
		},
		{
			id: "recipient",
			header: "Empfänger",
			cell: ({ row: { original: r } }) => (
				<>
					<div>{r.recipientName}</div>
					{r.iban && (
						<button
							type="button"
							onClick={() => copyIban(r.iban ?? "")}
							className="group/iban inline-flex items-center gap-1 font-mono text-muted-foreground text-xs hover:text-foreground"
							title="IBAN kopieren"
						>
							{formatIban(r.iban)}
							<Copy className="size-3 opacity-0 transition-opacity group-hover/iban:opacity-100 max-md:opacity-100" />
						</button>
					)}
				</>
			),
			meta: { mobile: "meta" },
		},
		{
			id: "receipt",
			header: "Beleg",
			cell: ({ row: { original: r } }) => (
				<ReceiptLinks
					receipts={r.receipts}
					legacyUrl={r.receiptUrl}
					legacyName={r.receiptName}
				/>
			),
			meta: { mobile: "meta" },
		},
		{
			id: "amount",
			header: "Betrag",
			cell: ({ row }) => formatEUR(row.original.amount),
			meta: {
				mobile: "subtitle",
				className: "md:text-right",
				cellClassName:
					"font-semibold max-md:order-first max-md:font-bold max-md:text-foreground max-md:text-xl max-md:tracking-tight",
			},
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => (
				<ReimbursementStatusBadge status={row.original.status} />
			),
			meta: { mobile: "meta" },
		},
	];
	if (isTreasury) {
		columns.push({
			id: "actions",
			header: () => <span className="sr-only">Aktionen</span>,
			cell: ({ row }) => (
				<div className="flex justify-end gap-1.5 max-md:w-full">
					{primaryAction(row.original)}
					{moreMenu(row.original)}
				</div>
			),
			meta: {
				mobile: "action",
				className: "md:w-0",
				cellClassName: "max-md:border-t max-md:pt-2.5",
			},
		});
	}

	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<ChipGroup<Filter>
					aria-label="Anträge filtern"
					bleed
					value={filter}
					onValueChange={setFilter}
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
				<div className="md:overflow-hidden md:rounded-xl md:border md:bg-card md:shadow-xs">
					<DataList
						data={filtered}
						columns={columns}
						getRowId={(r) => r.id}
						caption="Kostenerstattungen"
						headerClassName="bg-muted/40 hover:bg-muted/40"
						rowClassName="align-top max-md:rounded-xl max-md:p-4 max-md:shadow-xs"
					/>
				</div>
			)}

			<RejectReimbursementDialog
				open={rejectId !== null}
				reason={rejectReason}
				onReasonChange={setRejectReason}
				onClose={() => setRejectId(null)}
				onConfirm={confirmReject}
				isPending={isPending}
			/>

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
