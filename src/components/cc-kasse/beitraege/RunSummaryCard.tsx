"use client";

import {
	BellRing,
	Mail,
	MoreHorizontal,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Progress } from "~/components/ui/progress";
import { formatDate, formatEUR } from "~/lib/format";
import {
	type ChargesForRun,
	regenerateCharges,
} from "~/server/actions/members/semesterbeitrag";

/** Summary of the selected Beitragslauf: collected so far and run actions. */
export function RunSummaryCard({
	run,
	charges,
	isPending,
	sendEmails,
	sendMahn,
	runAction,
	onDelete,
}: {
	run: ChargesForRun["run"];
	charges: ChargesForRun["charges"];
	isPending: boolean;
	sendEmails: () => void;
	sendMahn: () => void;
	runAction: (
		action: () => Promise<{ success: boolean; error?: string }>,
	) => void;
	onDelete: () => void;
}) {
	const paid = charges.filter((c) => c.status === "Bezahlt").length;
	const totalPaid = charges
		.filter((c) => c.status === "Bezahlt")
		.reduce((s, c) => s + c.total, 0);
	const totalExpected = charges.reduce((s, c) => s + c.total, 0);

	return (
		<div className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-muted-foreground text-sm">Eingenommen</p>
					<p className="font-bold text-2xl tabular-nums tracking-tight sm:text-3xl">
						{formatEUR(totalPaid)}
					</p>
					<p className="text-muted-foreground text-xs tabular-nums">
						von {formatEUR(totalExpected)} · fällig {formatDate(run.dueDate)}
					</p>
				</div>
				<div className="text-right">
					<p className="font-semibold text-lg tabular-nums">
						{paid}/{charges.length}
					</p>
					<p className="text-muted-foreground text-xs">bezahlt</p>
				</div>
			</div>
			<Progress
				className="mt-4 h-2.5 [&>[data-slot=progress-indicator]]:bg-success"
				value={charges.length ? (paid / charges.length) * 100 : 0}
			/>
			<div className="mt-4 flex flex-wrap gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={sendEmails}
					disabled={isPending || charges.length === 0}
				>
					<Mail /> E-Mails senden
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={sendMahn}
					disabled={isPending || charges.length === 0}
				>
					<BellRing /> Mahnen
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={isPending}
							aria-label="Weitere Aktionen"
						>
							<MoreHorizontal />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onClick={() => runAction(() => regenerateCharges(run.id))}
						>
							<RefreshCw /> Mitglieder aktualisieren
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onClick={onDelete}>
							<Trash2 /> Lauf löschen
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
