"use client";

import { Check, HelpCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { getEventRsvps } from "~/server/actions/events/rsvp";

type Row = Awaited<ReturnType<typeof getEventRsvps>>[number];

const STATUS_META = {
	yes: {
		label: "Zugesagt",
		icon: <Check className="h-3 w-3" />,
		className: "bg-green-100 text-green-700",
	},
	maybe: {
		label: "Vielleicht",
		icon: <HelpCircle className="h-3 w-3" />,
		className: "bg-amber-100 text-amber-700",
	},
	no: {
		label: "Abgesagt",
		icon: <X className="h-3 w-3" />,
		className: "bg-red-100 text-red-700",
	},
} as const;

export function RsvpResponsesDialog({
	eventId,
	eventTitle,
	open,
	onOpenChange,
}: {
	eventId: string | null;
	eventTitle: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [rows, setRows] = useState<Row[] | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!open || !eventId) return;
		let cancelled = false;
		setLoading(true);
		getEventRsvps(eventId)
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

	const grouped = {
		yes: rows?.filter((r) => r.status === "yes") ?? [],
		maybe: rows?.filter((r) => r.status === "maybe") ?? [],
		no: rows?.filter((r) => r.status === "no") ?? [],
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Antworten: {eventTitle}</DialogTitle>
				</DialogHeader>
				{loading && <p className="text-muted-foreground text-sm">Lade...</p>}
				{!loading && rows && rows.length === 0 && (
					<p className="py-6 text-center text-muted-foreground text-sm">
						Noch keine Antworten.
					</p>
				)}
				{!loading && rows && rows.length > 0 && (
					<div className="space-y-4">
						{(["yes", "maybe", "no"] as const).map((status) => {
							const list = grouped[status];
							if (list.length === 0) return null;
							const meta = STATUS_META[status];
							return (
								<div key={status} className="space-y-2">
									<div className="flex items-center gap-2">
										<span
											className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs ${meta.className}`}
										>
											{meta.icon}
											{meta.label}
										</span>
										<span className="text-muted-foreground text-xs tabular-nums">
											{list.length}
										</span>
									</div>
									<ul className="divide-y rounded-md border">
										{list.map((r) => (
											<li
												key={r.userId}
												className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
											>
												<div className="min-w-0">
													<div className="truncate font-medium">
														{r.userName ?? r.userEmail}
													</div>
													{r.note && (
														<div className="truncate text-muted-foreground text-xs">
															{r.note}
														</div>
													)}
												</div>
												<div className="shrink-0 text-muted-foreground text-xs">
													{(r.updatedAt ?? r.createdAt).toLocaleDateString(
														"de-DE",
														{
															day: "2-digit",
															month: "short",
														},
													)}
												</div>
											</li>
										))}
									</ul>
								</div>
							);
						})}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
