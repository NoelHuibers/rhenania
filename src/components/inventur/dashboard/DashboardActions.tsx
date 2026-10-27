"use client";

import { FileSpreadsheet, PartyPopper, Save } from "lucide-react";
import { Button } from "~/components/ui/button";

/**
 * Quick save of the changed rows, and (outside an event inventory) the
 * buttons that start an event inventory or a full inventory.
 */
export function DashboardActions({
	changedCount,
	isQuickSaving,
	onQuickSave,
	showStartButtons,
	isSaving,
	isEventPending,
	onStartEvent,
	onFullInventory,
}: {
	changedCount: number;
	isQuickSaving: boolean;
	onQuickSave: () => void;
	/** False while an event inventory runs. */
	showStartButtons: boolean;
	isSaving: boolean;
	isEventPending: boolean;
	onStartEvent: () => void;
	onFullInventory: () => void;
}) {
	const hasChanges = changedCount > 0;
	return (
		<div className="flex flex-col gap-2 sm:shrink-0 sm:flex-row">
			<Button
				onClick={onQuickSave}
				disabled={!hasChanges || isQuickSaving}
				variant={hasChanges ? "default" : "outline"}
				size="sm"
			>
				<Save className="mr-2 h-4 w-4" />
				{isQuickSaving
					? "Speichere..."
					: hasChanges
						? `${changedCount} speichern`
						: "Keine Änderungen"}
			</Button>
			{showStartButtons && (
				<>
					<Button
						onClick={onStartEvent}
						disabled={isSaving || isEventPending}
						variant="outline"
						size="sm"
					>
						<PartyPopper className="mr-2 h-4 w-4" />
						Veranstaltung
					</Button>
					<Button
						onClick={onFullInventory}
						disabled={isSaving}
						variant="secondary"
						size="sm"
					>
						<FileSpreadsheet className="mr-2 h-4 w-4" />
						{isSaving ? "Erstelle..." : "Vollständige Inventur"}
					</Button>
				</>
			)}
		</div>
	);
}
