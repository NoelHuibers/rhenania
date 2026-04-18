"use client";

import { Check, HelpCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import {
	type AttendeePreview,
	getEventAttendees,
} from "~/server/actions/events/rsvp";

type AttendeeRow = Awaited<ReturnType<typeof getEventAttendees>>[number];

function initials(name: string | null | undefined) {
	if (!name) return "?";
	const parts = name.trim().split(/\s+/).slice(0, 2);
	return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function RsvpAttendees({
	eventId,
	eventTitle,
	preview,
	yesCount,
	maybeCount,
}: {
	eventId: string;
	eventTitle: string;
	preview: AttendeePreview[];
	yesCount: number;
	maybeCount: number;
}) {
	const [open, setOpen] = useState(false);

	if (yesCount === 0 && maybeCount === 0) return null;

	const overflow = Math.max(0, yesCount - preview.length);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="group flex items-center gap-2 rounded-md py-1 text-left text-muted-foreground text-xs transition-colors hover:text-foreground"
			>
				{preview.length > 0 && (
					<div className="flex -space-x-1.5">
						{preview.map((p) => (
							<Avatar
								key={p.userId}
								className="size-6 border-2 border-background transition-transform group-hover:scale-105"
							>
								{p.image && <AvatarImage src={p.image} alt={p.name ?? ""} />}
								<AvatarFallback className="text-[10px]">
									{initials(p.name)}
								</AvatarFallback>
							</Avatar>
						))}
						{overflow > 0 && (
							<div className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted font-medium text-[10px] text-muted-foreground">
								+{overflow}
							</div>
						)}
					</div>
				)}
				<span>
					{yesCount > 0 && <span>{yesCount} kommen</span>}
					{yesCount > 0 && maybeCount > 0 && <span> · </span>}
					{maybeCount > 0 && <span>{maybeCount} vielleicht</span>}
				</span>
			</button>

			<AttendeesDialog
				eventId={eventId}
				eventTitle={eventTitle}
				open={open}
				onOpenChange={setOpen}
			/>
		</>
	);
}

function AttendeesDialog({
	eventId,
	eventTitle,
	open,
	onOpenChange,
}: {
	eventId: string;
	eventTitle: string;
	open: boolean;
	onOpenChange: (o: boolean) => void;
}) {
	const [rows, setRows] = useState<AttendeeRow[] | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setLoading(true);
		getEventAttendees(eventId)
			.then((data) => {
				if (!cancelled) setRows(data);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [open, eventId]);

	const yes = rows?.filter((r) => r.status === "yes") ?? [];
	const maybe = rows?.filter((r) => r.status === "maybe") ?? [];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{eventTitle}</DialogTitle>
				</DialogHeader>
				{loading && <p className="text-muted-foreground text-sm">Lade...</p>}
				{!loading && rows && rows.length === 0 && (
					<p className="py-6 text-center text-muted-foreground text-sm">
						Noch niemand hat zugesagt.
					</p>
				)}
				{!loading && rows && rows.length > 0 && (
					<div className="space-y-4">
						<Group
							icon={<Check className="h-3 w-3" />}
							label="Kommen"
							className="bg-green-100 text-green-700"
							rows={yes}
						/>
						<Group
							icon={<HelpCircle className="h-3 w-3" />}
							label="Vielleicht"
							className="bg-amber-100 text-amber-700"
							rows={maybe}
						/>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

function Group({
	icon,
	label,
	className,
	rows,
}: {
	icon: React.ReactNode;
	label: string;
	className: string;
	rows: AttendeeRow[];
}) {
	if (rows.length === 0) return null;
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<span
					className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs ${className}`}
				>
					{icon}
					{label}
				</span>
				<span className="text-muted-foreground text-xs tabular-nums">
					{rows.length}
				</span>
			</div>
			<ul className="space-y-1.5">
				{rows.map((r) => (
					<li key={r.userId} className="flex items-center gap-2.5 text-sm">
						<Avatar className="size-7">
							{r.userImage && (
								<AvatarImage src={r.userImage} alt={r.userName ?? ""} />
							)}
							<AvatarFallback className="text-[10px]">
								{initials(r.userName)}
							</AvatarFallback>
						</Avatar>
						<span className="truncate">{r.userName ?? "Unbekannt"}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
