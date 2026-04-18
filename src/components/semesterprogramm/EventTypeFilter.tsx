"use client";

import { Filter } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import {
	type EventTypeName,
	setHiddenEventTypes,
} from "~/server/actions/profile/preferences";

const ALL_EVENT_TYPES: EventTypeName[] = [
	"Intern",
	"AHV",
	"oCC",
	"SC",
	"Jour Fix",
	"Stammtisch",
	"Sonstige",
];

export function EventTypeFilter({
	initialHidden,
}: {
	initialHidden: EventTypeName[];
}) {
	const router = useRouter();
	const [hidden, setHidden] = useState<Set<EventTypeName>>(
		new Set(initialHidden),
	);
	const [isPending, startTransition] = useTransition();

	function toggle(type: EventTypeName) {
		const next = new Set(hidden);
		if (next.has(type)) next.delete(type);
		else next.add(type);
		setHidden(next);

		startTransition(async () => {
			await setHiddenEventTypes(Array.from(next));
			router.refresh();
		});
	}

	function reset() {
		setHidden(new Set());
		startTransition(async () => {
			await setHiddenEventTypes([]);
			router.refresh();
		});
	}

	const activeCount = hidden.size;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="h-8 gap-1.5"
					disabled={isPending}
				>
					<Filter className="h-3.5 w-3.5" />
					Filter
					{activeCount > 0 && (
						<span className="ml-0.5 rounded-full bg-primary px-1.5 py-0.5 font-medium text-[10px] text-primary-foreground tabular-nums">
							{activeCount}
						</span>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-56 p-3">
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<p className="font-medium text-sm">Veranstaltungstypen</p>
						{activeCount > 0 && (
							<button
								type="button"
								onClick={reset}
								className="text-muted-foreground text-xs hover:text-foreground"
							>
								Zurücksetzen
							</button>
						)}
					</div>
					<div className="space-y-2">
						{ALL_EVENT_TYPES.map((type) => {
							const visible = !hidden.has(type);
							return (
								<div key={type} className="flex items-center gap-2">
									<Checkbox
										id={`filter-${type}`}
										checked={visible}
										onCheckedChange={() => toggle(type)}
									/>
									<Label
										htmlFor={`filter-${type}`}
										className="cursor-pointer font-normal text-sm"
									>
										{type}
									</Label>
								</div>
							);
						})}
					</div>
					<p className="border-t pt-2 text-muted-foreground text-xs leading-snug">
						Wirkt sich auch auf den abonnierten Kalender aus.
					</p>
				</div>
			</PopoverContent>
		</Popover>
	);
}
