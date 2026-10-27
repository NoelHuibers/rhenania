import type * as React from "react";

import { cn } from "~/lib/utils";

export type StatTileTone =
	| "default"
	| "success"
	| "warning"
	| "danger"
	| "info";

// Text tokens that meet 4.5:1 on the card in light and dark.
const VALUE_TONE: Record<StatTileTone, string> = {
	default: "",
	success: "text-success",
	warning: "text-warning-muted-foreground",
	danger: "text-destructive",
	info: "text-info",
};

/**
 * The one key-figure tile (#87): a small label with an icon, a large value
 * and an optional hint below. `children` go under the hint (a progress bar,
 * a trend). Lay tiles out in a grid; the tile fills its cell.
 */
export function StatTile({
	icon,
	label,
	value,
	hint,
	tone = "default",
	className,
	children,
}: {
	/** A lucide icon; decorative. */
	icon?: React.ReactNode;
	label: React.ReactNode;
	value: React.ReactNode;
	hint?: React.ReactNode;
	/** Colours the value, for figures that are good, bad or need attention. */
	tone?: StatTileTone;
	className?: string;
	children?: React.ReactNode;
}) {
	return (
		<div
			data-slot="stat-tile"
			className={cn(
				"min-w-0 rounded-2xl border bg-card p-4 text-card-foreground shadow-xs",
				className,
			)}
		>
			<div className="flex items-center gap-2 text-muted-foreground text-xs">
				{icon && (
					<span
						aria-hidden="true"
						className="flex shrink-0 [&_svg:not([class*='size-'])]:size-4"
					>
						{icon}
					</span>
				)}
				<span className="truncate">{label}</span>
			</div>
			<div
				className={cn(
					"mt-1 font-semibold text-lg tabular-nums leading-tight sm:text-xl",
					VALUE_TONE[tone],
				)}
			>
				{value}
			</div>
			{hint && <div className="text-muted-foreground text-xs">{hint}</div>}
			{children}
		</div>
	);
}
