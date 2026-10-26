"use client";

import type * as React from "react";
import { Button } from "~/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

// An invisible 44×44 px box centred on the button: the touch target meets
// WCAG 2.5.5 even when the visible button is smaller.
const HIT_AREA =
	"relative after:absolute after:top-1/2 after:left-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2";

type IconButtonProps = Omit<
	React.ComponentProps<typeof Button>,
	"size" | "aria-label"
> & {
	/** Accessible name, also shown as tooltip. German, e.g. "Eintrag löschen". */
	label: string;
	size?: "icon" | "icon-sm" | "icon-lg";
	/** Show the label as a tooltip on hover and focus (default true). */
	tooltip?: boolean;
};

/** A button whose only content is an icon. `label` is required. */
export function IconButton({
	label,
	size = "icon",
	tooltip = true,
	variant = "ghost",
	className,
	...props
}: IconButtonProps) {
	const button = (
		<Button
			size={size}
			variant={variant}
			aria-label={label}
			className={cn(HIT_AREA, className)}
			{...props}
		/>
	);
	if (!tooltip) {
		return button;
	}
	return (
		<TooltipProvider delayDuration={400}>
			<Tooltip>
				<TooltipTrigger asChild>{button}</TooltipTrigger>
				<TooltipContent>{label}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
