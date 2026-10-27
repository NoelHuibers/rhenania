"use client";

import { Check, Clock3, FileText, MoreVertical, Undo2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { formatEUR } from "~/lib/format";
import {
	type ChargeListItem,
	markChargeDeferred,
	markChargePaid,
	markChargeUnpaid,
} from "~/server/actions/members/semesterbeitrag";

function chargeBadge(c: ChargeListItem) {
	if (c.status === "Bezahlt") {
		return (
			<Badge
				variant="outline"
				className="border-success/40 bg-success-muted font-medium text-success-muted-foreground"
			>
				Bezahlt
			</Badge>
		);
	}
	if (c.status === "Gestundet") {
		return (
			<Badge
				variant="outline"
				className="border-warning/40 bg-warning-muted font-medium text-warning-muted-foreground"
			>
				Gestundet
			</Badge>
		);
	}
	if (c.status === "Gemahnt") {
		return (
			<Badge
				variant="outline"
				className="border-danger/40 bg-danger-muted font-medium text-danger-muted-foreground"
			>
				Gemahnt
			</Badge>
		);
	}
	if (c.ueberfaellig) {
		return (
			<Badge
				variant="outline"
				className="border-warning/40 bg-warning-muted font-medium text-warning-muted-foreground"
			>
				Überfällig
			</Badge>
		);
	}
	return <Badge variant="secondary">Offen</Badge>;
}

/** One member's charge in a Beitragslauf: status, amount and actions. */
export function ChargeRow({
	c,
	isPending,
	runAction,
	dlPdf,
}: {
	c: ChargeListItem;
	isPending: boolean;
	runAction: (
		action: () => Promise<{ success: boolean; error?: string }>,
	) => void;
	dlPdf: (chargeId: string, isMahnung: boolean) => void;
}) {
	return (
		<li className="flex items-center justify-between gap-3 px-4 py-3">
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium text-sm">{c.memberName}</span>
					{chargeBadge(c)}
				</div>
				<div className="text-muted-foreground text-xs tabular-nums">
					{formatEUR(c.total)}
					{c.mahnungAmount > 0 &&
						` (inkl. ${formatEUR(c.mahnungAmount)} Mahngebühr)`}
					{!c.hasEmail && " · Brief nötig"}
					{c.emailSentAt && " · Email gesendet"}
				</div>
			</div>
			<div className="flex shrink-0 items-center gap-1">
				{c.status !== "Bezahlt" && (
					<Button
						variant="outline"
						size="sm"
						disabled={isPending}
						onClick={() => runAction(() => markChargePaid(c.id))}
					>
						<Check />
						<span className="hidden sm:inline">Bezahlt</span>
					</Button>
				)}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							disabled={isPending}
							aria-label={`Aktionen für ${c.memberName}`}
						>
							<MoreVertical />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{c.status !== "Bezahlt" && c.status !== "Gestundet" && (
							<DropdownMenuItem
								onClick={() => runAction(() => markChargeDeferred(c.id))}
							>
								<Clock3 /> Stunden
							</DropdownMenuItem>
						)}
						{(c.status === "Bezahlt" || c.status === "Gestundet") && (
							<DropdownMenuItem
								onClick={() => runAction(() => markChargeUnpaid(c.id))}
							>
								<Undo2 /> Zurücksetzen
							</DropdownMenuItem>
						)}
						<DropdownMenuItem onClick={() => dlPdf(c.id, c.mahnungAmount > 0)}>
							<FileText /> PDF herunterladen
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</li>
	);
}
