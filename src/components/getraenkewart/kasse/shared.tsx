"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { statusClass } from "~/components/ui/status-badge";
import { billStatusStyle } from "~/lib/status";

/** Status-button colours for a bill status. */
export function billStatusClass(status: string) {
	return statusClass(billStatusStyle(status));
}

/** Collapsible bill card shell: the title toggles the body. */
export function CollapsibleCard({
	title,
	meta,
	action,
	children,
	defaultOpen = true,
}: {
	title: string;
	meta?: React.ReactNode;
	action?: React.ReactNode;
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<Card>
			<Collapsible open={open} onOpenChange={setOpen}>
				<CardHeader className="flex flex-row items-center justify-between gap-2 transition-colors hover:bg-muted/50">
					{/* The title is the toggle (a real button, so it works with the
					    keyboard); the chevron repeats it for the mouse only. */}
					<CollapsibleTrigger className="-m-1 flex min-h-9 flex-1 cursor-pointer items-center gap-2 rounded-md p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
						<span className="font-heading font-medium text-base">{title}</span>
						{meta}
					</CollapsibleTrigger>
					<div className="flex items-center gap-2">
						{action}
						<CollapsibleTrigger
							tabIndex={-1}
							aria-hidden
							className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-muted"
						>
							{open ? (
								<ChevronUp className="size-4" />
							) : (
								<ChevronDown className="size-4" />
							)}
						</CollapsibleTrigger>
					</div>
				</CardHeader>
				<CollapsibleContent>
					<CardContent className="p-0">{children}</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}
