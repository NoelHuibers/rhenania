"use client";

import { CalendarClock, Pencil, Power, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { IconButton } from "~/components/ui/icon-button";
import { formatEventShortDate } from "~/lib/time";
import {
	type RecurringEvent,
	recurrenceSummary,
	TYPE_COLORS,
} from "./recurring-event-constants";

/** One recurring-event template with its actions and instance generator. */
export function RecurringEventCard({
	event: r,
	generating,
	generateResult,
	onToggleActive,
	onEdit,
	onDelete,
	onGenerate,
}: {
	event: RecurringEvent;
	generating: boolean;
	generateResult: string | undefined;
	onToggleActive: (id: string) => void;
	onEdit: (r: RecurringEvent) => void;
	onDelete: (id: string) => void;
	onGenerate: (id: string) => void;
}) {
	return (
		<Card className={r.isActive ? "" : "opacity-50"}>
			<CardContent className="space-y-3 p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<span className="font-medium">{r.title}</span>
							<span
								className={`rounded-full px-2 py-0.5 font-medium text-xs ${TYPE_COLORS[r.type]}`}
							>
								{r.type}
							</span>
							{!r.isActive && (
								<span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500 text-xs">
									Inaktiv
								</span>
							)}
							{!r.isPublic && (
								<span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500 text-xs">
									Intern
								</span>
							)}
						</div>
						<p className="flex items-center gap-1.5 text-muted-foreground text-sm">
							<CalendarClock className="h-3.5 w-3.5 shrink-0" />
							{recurrenceSummary(r)}
							{r.location && ` · ${r.location}`}
						</p>
						{(r.startDate || r.endDate) && (
							<p className="text-muted-foreground text-xs">
								{r.startDate && formatEventShortDate(r.startDate)}
								{r.startDate && r.endDate && " – "}
								{r.endDate && formatEventShortDate(r.endDate)}
							</p>
						)}
					</div>
					<div className="flex shrink-0 gap-1">
						<IconButton
							label={r.isActive ? "Serie deaktivieren" : "Serie aktivieren"}
							onClick={() => onToggleActive(r.id)}
						>
							<Power className="h-4 w-4" />
						</IconButton>
						<IconButton label="Serie bearbeiten" onClick={() => onEdit(r)}>
							<Pencil className="h-4 w-4" />
						</IconButton>
						<IconButton
							label="Serie löschen"
							onClick={() => onDelete(r.id)}
							className="text-destructive hover:text-destructive"
						>
							<Trash2 className="h-4 w-4" />
						</IconButton>
					</div>
				</div>

				{r.isActive && (
					<div className="flex items-center gap-2 border-t pt-2">
						<Button
							size="sm"
							variant="outline"
							className="h-7 text-xs"
							disabled={generating}
							onClick={() => onGenerate(r.id)}
						>
							{generating ? "Generiere..." : "Termine generieren"}
						</Button>
						{generateResult && (
							<span
								className={`text-xs ${generateResult.startsWith("Fehler") ? "text-destructive" : "text-green-600"}`}
							>
								{generateResult}
							</span>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
