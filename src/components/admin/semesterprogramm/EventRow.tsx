"use client";

import {
	Ban,
	CalendarDays,
	MapPin,
	MoreHorizontal,
	Pencil,
	RotateCcw,
	Trash2,
	Users,
} from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { IconButton } from "~/components/ui/icon-button";
import { formatAcademicTimeAlways, formatEventShortDate } from "~/lib/time";
import { type Event, TYPE_COLORS } from "./event-constants";

/** One event in the admin list, with its cancel, edit and delete actions. */
export function EventRow({
	event,
	onEdit,
	onDelete,
	onToggleCancel,
	onShowRsvps,
	past,
}: {
	event: Event;
	onEdit: (e: Event) => void;
	onDelete: (id: string) => void;
	onToggleCancel: (id: string) => void;
	onShowRsvps: (e: Event) => void;
	past?: boolean;
}) {
	const showNonPublicBadge = !event.isPublic && event.type !== "Intern";
	return (
		<Card className={`py-0 ${past || event.isCancelled ? "opacity-60" : ""}`}>
			<CardContent className="flex items-start justify-between gap-3 p-4 sm:gap-4">
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<span
							className={`font-medium ${event.isCancelled ? "text-muted-foreground line-through" : ""}`}
						>
							{event.title}
						</span>
						<span
							className={`rounded-full px-2 py-0.5 font-medium text-xs ${TYPE_COLORS[event.type]}`}
						>
							{event.type}
						</span>
						{event.isCancelled && (
							<span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 text-xs">
								Abgesagt
							</span>
						)}
						{event.recurringEventId && (
							<span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 text-xs">
								Wiederkehrend
							</span>
						)}
						{showNonPublicBadge && (
							<span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500 text-xs">
								Nicht öffentlich
							</span>
						)}
					</div>
					<div className="flex flex-col gap-1 text-muted-foreground text-sm sm:flex-row sm:flex-wrap sm:gap-x-4">
						<span className="flex flex-wrap items-center gap-1">
							<CalendarDays className="h-3.5 w-3.5" />
							<span>{formatEventShortDate(event.date)},</span>
							<span className="whitespace-nowrap">
								{formatAcademicTimeAlways(event.date)}
							</span>
						</span>
						{event.location && (
							<span className="flex items-center gap-1">
								<MapPin className="h-3.5 w-3.5" />
								{event.location}
							</span>
						)}
						<button
							type="button"
							onClick={() => onShowRsvps(event)}
							className="flex items-center gap-1 self-start rounded-md hover:text-foreground"
						>
							<Users className="h-3.5 w-3.5" />
							<span className="whitespace-nowrap">
								{event.yesCount} Zusagen
								{event.maybeCount > 0 && ` · ${event.maybeCount} Vielleicht`}
								{event.maxAttendees != null && ` / ${event.maxAttendees}`}
							</span>
						</button>
					</div>
					{event.description && (
						<p className="line-clamp-1 text-muted-foreground text-sm">
							{event.description}
						</p>
					)}
				</div>
				<div className="hidden shrink-0 gap-1 sm:flex">
					<IconButton
						label={
							event.isCancelled ? "Absage rückgängig machen" : "Termin absagen"
						}
						onClick={() => onToggleCancel(event.id)}
					>
						{event.isCancelled ? (
							<RotateCcw className="h-4 w-4" />
						) : (
							<Ban className="h-4 w-4" />
						)}
					</IconButton>
					<IconButton label="Termin bearbeiten" onClick={() => onEdit(event)}>
						<Pencil className="h-4 w-4" />
					</IconButton>
					<IconButton
						label="Termin löschen"
						onClick={() => onDelete(event.id)}
						className="text-destructive hover:text-destructive"
					>
						<Trash2 className="h-4 w-4" />
					</IconButton>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild className="shrink-0 sm:hidden">
						<IconButton label="Weitere Aktionen" className="-mt-1 -mr-2">
							<MoreHorizontal className="h-4 w-4" />
						</IconButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={() => onToggleCancel(event.id)}>
							{event.isCancelled ? (
								<>
									<RotateCcw className="h-4 w-4" />
									Absage rückgängig
								</>
							) : (
								<>
									<Ban className="h-4 w-4" />
									Absagen
								</>
							)}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={() => onEdit(event)}>
							<Pencil className="h-4 w-4" />
							Bearbeiten
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => onDelete(event.id)}
							variant="destructive"
						>
							<Trash2 className="h-4 w-4" />
							Löschen
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</CardContent>
		</Card>
	);
}
