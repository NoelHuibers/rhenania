"use client";

import { PartyPopper } from "lucide-react";
import { Button } from "~/components/ui/button";
import { formatDateTime } from "~/lib/format";
import type { ActiveEventInventory } from "~/server/actions/inventur/inventur";

/** Banner while an event inventory runs: finish it or cancel it. */
export function ActiveEventBanner({
	activeEvent,
	isPending,
	onFinish,
	onCancel,
}: {
	activeEvent: NonNullable<ActiveEventInventory>;
	isPending: boolean;
	onFinish: () => void;
	onCancel: () => void;
}) {
	return (
		<div className="mb-4 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-muted p-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-start gap-3">
				<PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-warning-muted-foreground" />
				<div>
					<div className="font-semibold">
						Veranstaltungs-Inventur läuft: {activeEvent.eventName}
					</div>
					<div className="text-muted-foreground text-sm">
						Anfangsbestand erfasst am {formatDateTime(activeEvent.startedAt)}.
						Zähle jetzt den Endbestand und schließe ab.
					</div>
				</div>
			</div>
			<div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row">
				<Button size="sm" onClick={onFinish} disabled={isPending}>
					Endbestand abschließen
				</Button>
				<Button
					size="sm"
					variant="ghost"
					onClick={onCancel}
					disabled={isPending}
				>
					Abbrechen
				</Button>
			</div>
		</div>
	);
}
