import type * as React from "react";
import { Badge } from "~/components/ui/badge";
import {
	billStatusStyle,
	reimbursementStatusStyle,
	type StatusStyle,
	type StatusTone,
} from "~/lib/status";
import { cn } from "~/lib/utils";

// Every pair meets 4.5:1 in light and dark (see test/theme-contrast.test.ts).
const SUBTLE: Record<StatusTone, string> = {
	success: "border-success/30 bg-success-muted text-success-muted-foreground",
	warning: "border-warning/60 bg-warning-muted text-warning-muted-foreground",
	info: "border-info/30 bg-info-muted text-info-muted-foreground",
	danger: "border-danger/30 bg-danger-muted text-danger-muted-foreground",
	neutral: "border-border bg-muted text-secondary-foreground",
};

const STRONG: Record<StatusTone, string> = {
	success: "border-transparent bg-success text-success-foreground",
	warning: "border-transparent bg-warning text-warning-foreground",
	info: "border-transparent bg-info text-info-foreground",
	danger: "border-transparent bg-danger text-danger-foreground",
	neutral: "border-transparent bg-secondary text-secondary-foreground",
};

/** Colour classes for a status, for elements that are not a Badge. */
export function statusClass({ tone, strong }: StatusStyle): string {
	return (strong ? STRONG : SUBTLE)[tone];
}

export function StatusBadge({
	tone,
	strong,
	className,
	...props
}: React.ComponentProps<typeof Badge> & StatusStyle) {
	return (
		<Badge
			variant="outline"
			className={cn(statusClass({ tone, strong }), className)}
			{...props}
		/>
	);
}

export function BillStatusBadge({
	status,
	className,
}: {
	status: string | null | undefined;
	className?: string;
}) {
	return (
		<StatusBadge {...billStatusStyle(status)} className={className}>
			{status || "Unbezahlt"}
		</StatusBadge>
	);
}

export function ReimbursementStatusBadge({ status }: { status: string }) {
	return (
		<StatusBadge {...reimbursementStatusStyle(status)}>{status}</StatusBadge>
	);
}
