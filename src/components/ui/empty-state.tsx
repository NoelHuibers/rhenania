import type * as React from "react";

import { cn } from "~/lib/utils";

type EmptyStateProps = {
	/** A lucide icon (no size needed); shown in a muted circle. */
	icon?: React.ReactNode;
	title: string;
	/** One or two sentences: why it is empty and what to do next. */
	children?: React.ReactNode;
	/** A button or link that fills the list (e.g. "Getränk hinzufügen"). */
	action?: React.ReactNode;
	/**
	 * `dashed` (default) draws its own dashed frame, for empty sections on a
	 * page. `plain` has no frame, for use inside a card, table or dialog.
	 */
	variant?: "dashed" | "plain";
	className?: string;
};

/** The one empty-list placeholder: "nothing here yet" plus the next step. */
export function EmptyState({
	icon,
	title,
	children,
	action,
	variant = "dashed",
	className,
}: EmptyStateProps) {
	return (
		<div
			data-slot="empty-state"
			className={cn(
				"flex flex-col items-center gap-2 px-6 py-10 text-center",
				variant === "dashed" && "rounded-xl border border-dashed",
				className,
			)}
		>
			{icon && (
				<div
					aria-hidden="true"
					className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-5"
				>
					{icon}
				</div>
			)}
			<p className="font-medium text-sm">{title}</p>
			{children && (
				<div className="max-w-sm text-muted-foreground text-sm">{children}</div>
			)}
			{action && <div className="mt-2">{action}</div>}
		</div>
	);
}
