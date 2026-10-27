"use client";

import { CalendarDays, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { IconButton } from "~/components/ui/icon-button";
import { formatDate, formatEUR } from "~/lib/format";
import type { EinnahmeRow } from "~/server/actions/cc-kasse/einnahmen";
import type { KostenpunktWithPositions } from "~/server/actions/cc-kasse/kostenpunkte";

/** One Kostenpunkt in the editor: budget, plan positions and booked income. */
export function KostenpunktItem({
	kp,
	kpEinnahmen,
	isTreasury,
	onEdit,
	onDelete,
	onEditEinnahme,
	onDeleteEinnahme,
}: {
	kp: KostenpunktWithPositions;
	kpEinnahmen: EinnahmeRow[];
	isTreasury: boolean;
	onEdit: (kp: KostenpunktWithPositions) => void;
	onDelete: (id: string) => void;
	onEditEinnahme: (e: EinnahmeRow) => void;
	onDeleteEinnahme: (id: string) => void;
}) {
	const erhalten = kpEinnahmen.reduce((s, e) => s + e.amount, 0);
	return (
		<li className="px-4 py-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="font-medium text-sm">{kp.name}</div>
					{kp.event && (
						<div className="flex items-center gap-1 text-muted-foreground text-xs">
							<CalendarDays className="size-3" />
							<span className="truncate">{kp.event.title}</span>
						</div>
					)}
				</div>
				<div className="flex shrink-0 items-start gap-1">
					<div className="text-right">
						<div className="font-semibold text-sm tabular-nums">
							{formatEUR(kp.budget)}
						</div>
						{kp.income > 0 && (
							<div className="text-muted-foreground text-xs tabular-nums">
								+{formatEUR(kp.income)} geplant
							</div>
						)}
						{erhalten > 0 && (
							<div className="text-success text-xs tabular-nums">
								+{formatEUR(erhalten)} erhalten
							</div>
						)}
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								className="-mt-1 -mr-2"
								aria-label={`Aktionen für ${kp.name}`}
							>
								<MoreVertical />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => onEdit(kp)}>
								<Pencil /> Bearbeiten
							</DropdownMenuItem>
							<DropdownMenuItem
								variant="destructive"
								onClick={() => onDelete(kp.id)}
							>
								<Trash2 /> Löschen
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{kp.positionen.length > 0 && (
				<ul className="mt-2 space-y-0.5 border-l-2 pl-3">
					{kp.positionen.map((p) => (
						<li
							key={p.id}
							className="flex justify-between gap-3 text-muted-foreground text-xs"
						>
							<span className="min-w-0 truncate">{p.bemerkung ?? "—"}</span>
							<span className="shrink-0 whitespace-nowrap tabular-nums">
								{formatEUR(p.ausgaben)}
								{p.einnahmen > 0 && ` / +${formatEUR(p.einnahmen)}`}
							</span>
						</li>
					))}
				</ul>
			)}

			{kpEinnahmen.length > 0 && (
				<ul className="mt-2 space-y-0.5 border-success/50 border-l-2 pl-3">
					{kpEinnahmen.map((e) => (
						<li
							key={e.id}
							className="flex items-center justify-between gap-3 text-xs"
						>
							<span className="min-w-0 truncate text-muted-foreground">
								{formatDate(e.incomeDate)} · {e.description}
							</span>
							<span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap font-medium text-success tabular-nums">
								+{formatEUR(e.amount)}
								{isTreasury && (
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<IconButton size="icon-sm" label="Einnahme-Aktionen">
												<MoreVertical />
											</IconButton>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem onClick={() => onEditEinnahme(e)}>
												<Pencil /> Bearbeiten
											</DropdownMenuItem>
											<DropdownMenuItem
												variant="destructive"
												onClick={() => onDeleteEinnahme(e.id)}
											>
												<Trash2 /> Löschen
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								)}
							</span>
						</li>
					))}
				</ul>
			)}
		</li>
	);
}
