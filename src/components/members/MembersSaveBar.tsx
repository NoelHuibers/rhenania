"use client";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { type Change, pendingMessage } from "./member-edits";

export type SaveResult = {
	text: string;
	tone: "success" | "danger";
	/** Offered for UNDO_MS after a successful save. */
	undo?: Change[];
};

/**
 * Floats at the bottom of the screen while there is something to save or
 * a result to show. The text is announced by the status region above, so
 * the bar itself is not a live region.
 */
export function SaveBar({
	result,
	pending,
	saving,
	onSave,
	onDiscard,
	onUndo,
	onDismiss,
}: {
	result: SaveResult | null;
	pending: number;
	saving: boolean;
	onSave: () => void;
	onDiscard: () => void;
	onUndo: (changes: Change[]) => void;
	onDismiss: () => void;
}) {
	return (
		<div className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
			<div
				data-slot="members-save-bar"
				className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-popover px-4 py-2 text-popover-foreground text-sm shadow-lg"
			>
				{result && (
					<p
						className={cn(
							"min-w-0",
							result.tone === "danger"
								? "text-destructive"
								: "text-muted-foreground",
						)}
					>
						{result.text}
					</p>
				)}
				{result?.undo && (
					<Button
						size="sm"
						variant="outline"
						disabled={saving}
						onClick={() => onUndo(result.undo ?? [])}
					>
						Rückgängig
					</Button>
				)}
				{result && !result.undo && pending === 0 && (
					<Button size="sm" variant="ghost" onClick={onDismiss}>
						Schließen
					</Button>
				)}
				{pending > 0 && (
					<>
						<p className="font-medium">{pendingMessage(pending)}</p>
						<Button
							size="sm"
							variant="ghost"
							disabled={saving}
							onClick={onDiscard}
						>
							Verwerfen
						</Button>
						<Button size="sm" disabled={saving} onClick={onSave}>
							{saving ? "Speichert…" : "Speichern"}
						</Button>
					</>
				)}
			</div>
		</div>
	);
}
