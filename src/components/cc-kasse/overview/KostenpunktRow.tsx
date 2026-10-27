"use client";

import { ChevronDown, FileText } from "lucide-react";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { StackedBar } from "~/components/ui/stacked-bar";
import { ReimbursementStatusBadge } from "~/components/ui/status-badge";
import { formatDate, formatEUR } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { QueueReimbursement } from "~/server/actions/cc-kasse/kostenerstattungen";
import type { KostenpunktOverview } from "~/server/actions/cc-kasse/overview";
import { budgetBar, remainingTone } from "./budget";

export type KpExtras = {
	items: QueueReimbursement[];
	eingereicht: number;
	abgelehnt: number;
};

/** One Kostenpunkt with its budget bar; opens to list its reimbursements. */
export function KostenpunktRow({
	kp,
	extras,
	open,
	onOpenChange,
}: {
	kp: KostenpunktOverview;
	extras: KpExtras | undefined;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const items = extras?.items ?? [];
	const eingereicht = extras?.eingereicht ?? 0;
	const count = items.length;

	return (
		<li>
			<Collapsible open={open} onOpenChange={onOpenChange}>
				<CollapsibleTrigger className="group w-full px-4 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/60">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="truncate font-medium text-sm">{kp.name}</div>
							<div className="text-muted-foreground text-xs">
								{count === 0
									? "Keine Erstattungen"
									: `${count} ${count === 1 ? "Erstattung" : "Erstattungen"}`}
								{kp.genehmigt + eingereicht > 0 && (
									<span className="text-warning-muted-foreground">
										{" "}
										· {formatEUR(kp.genehmigt + eingereicht)} offen
									</span>
								)}
							</div>
						</div>
						<div className="flex shrink-0 items-start gap-2">
							<div className="text-right">
								<div
									className={cn(
										"font-semibold text-sm tabular-nums",
										remainingTone(kp.verbleibend, kp.budget),
									)}
								>
									{formatEUR(kp.verbleibend)}
								</div>
								<div className="text-muted-foreground text-xs tabular-nums">
									von {formatEUR(kp.budget)}
								</div>
							</div>
							<ChevronDown className="mt-0.5 size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
						</div>
					</div>
					<StackedBar
						className="mt-2.5"
						size="sm"
						{...budgetBar(kp.budget, kp.ausgegeben, kp.genehmigt, eingereicht)}
					/>
				</CollapsibleTrigger>

				<CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
					<div className="space-y-3 bg-muted/20 px-4 pt-1 pb-4">
						<dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
							<MiniStat label="Budget" value={kp.budget} />
							<MiniStat label="Ausgezahlt" value={kp.ausgegeben} />
							{kp.genehmigt > 0 && (
								<MiniStat label="Genehmigt" value={kp.genehmigt} />
							)}
							{eingereicht > 0 && (
								<MiniStat label="Eingereicht" value={eingereicht} />
							)}
						</dl>

						{items.length === 0 ? (
							<p className="py-3 text-center text-muted-foreground text-xs">
								Auf diesen Kostenpunkt wurde noch nichts gebucht.
							</p>
						) : (
							<ul className="divide-y overflow-hidden rounded-lg border bg-background">
								{items.map((r) => (
									<ErstattungItem key={r.id} r={r} />
								))}
							</ul>
						)}
						{(extras?.abgelehnt ?? 0) > 0 && (
							<p className="text-muted-foreground text-xs">
								{extras?.abgelehnt} abgelehnte{" "}
								{extras?.abgelehnt === 1 ? "Antrag" : "Anträge"} nicht
								mitgezählt.
							</p>
						)}
					</div>
				</CollapsibleContent>
			</Collapsible>
		</li>
	);
}

function MiniStat({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-lg bg-background px-3 py-2 ring-1 ring-border">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="font-medium text-sm tabular-nums">{formatEUR(value)}</dd>
		</div>
	);
}

function ErstattungItem({ r }: { r: QueueReimbursement }) {
	const receipts = r.receipts?.length
		? r.receipts
		: r.receiptUrl
			? [{ url: r.receiptUrl, name: r.receiptName ?? "Beleg" }]
			: [];
	const who =
		r.source === "Direktbuchung"
			? "Direktbuchung"
			: (r.submitter?.name ?? r.recipientName);

	return (
		<li className="flex items-start gap-3 px-3 py-2.5">
			<div className="min-w-0 flex-1">
				<p className="line-clamp-2 text-sm">{r.description}</p>
				<p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-muted-foreground text-xs">
					<span>{formatDate(r.expenseDate)}</span>
					<span aria-hidden>·</span>
					<span className="truncate">{who}</span>
					{receipts.map((f, i) => (
						<a
							key={f.url}
							href={f.url}
							target="_blank"
							rel="noopener noreferrer"
							onClick={(e) => e.stopPropagation()}
							className="inline-flex items-center gap-0.5 text-primary hover:underline"
						>
							<FileText className="size-3" />
							{receipts.length > 1 ? `Beleg ${i + 1}` : "Beleg"}
						</a>
					))}
				</p>
			</div>
			<div className="flex shrink-0 flex-col items-end gap-1">
				<span className="font-semibold text-sm tabular-nums">
					{formatEUR(r.amount)}
				</span>
				{r.status !== "Ausgezahlt" && (
					<ReimbursementStatusBadge status={r.status} />
				)}
			</div>
		</li>
	);
}
