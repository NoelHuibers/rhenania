"use client";

import type * as React from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { cn } from "~/lib/utils";

type ConfirmActionProps = {
	/** The button that opens the dialog (rendered as the trigger). */
	children?: React.ReactNode;
	title: string;
	description?: React.ReactNode;
	confirmLabel?: string;
	cancelLabel?: string;
	/** Red confirm button for actions that delete or cannot be undone. */
	destructive?: boolean;
	onConfirm: () => void | Promise<void>;
	/** Controlled use, without a trigger (e.g. confirm before a submit). */
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
};

/**
 * The one confirmation pattern: an AlertDialog with a cancel and a confirm
 * button. Use it for every destructive or hard-to-undo action instead of
 * window.confirm.
 */
export function ConfirmAction({
	children,
	title,
	description,
	confirmLabel = "Löschen",
	cancelLabel = "Abbrechen",
	destructive = true,
	onConfirm,
	open,
	onOpenChange,
}: ConfirmActionProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			{children ? (
				<AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
			) : null}
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					{description ? (
						<AlertDialogDescription>{description}</AlertDialogDescription>
					) : null}
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
					<AlertDialogAction
						onClick={() => void onConfirm()}
						className={cn(
							destructive &&
								"bg-destructive text-destructive-foreground hover:bg-destructive/90",
						)}
					>
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
