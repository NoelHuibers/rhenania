"use client";

import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

/** Asks for the reason before a reimbursement request is rejected. */
export function RejectReimbursementDialog({
	open,
	reason,
	onReasonChange,
	onClose,
	onConfirm,
	isPending,
}: {
	open: boolean;
	reason: string;
	onReasonChange: (reason: string) => void;
	onClose: () => void;
	onConfirm: () => void;
	isPending: boolean;
}) {
	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) {
					onClose();
				}
			}}
		>
			<DialogContent className="sm:max-w-[420px]">
				<DialogHeader>
					<DialogTitle>Antrag ablehnen</DialogTitle>
				</DialogHeader>
				<div className="grid gap-2 py-2">
					<Label htmlFor="reject-reason">Begründung</Label>
					<Textarea
						id="reject-reason"
						value={reason}
						onChange={(e) => onReasonChange(e.target.value)}
						placeholder="Warum wird der Antrag abgelehnt?"
						rows={3}
					/>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Abbrechen
					</Button>
					<Button
						variant="destructive"
						disabled={isPending || !reason.trim()}
						onClick={onConfirm}
					>
						Ablehnen
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
