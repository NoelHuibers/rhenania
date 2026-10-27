"use client";

import { Plus } from "lucide-react";
import Image from "next/image";
import { formatEUR } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { MenuItem } from "~/server/actions/menu";

interface DrinkButtonProps {
	drink: MenuItem;
	onSelect: (drink: MenuItem) => void;
	/** `row` in the menu, `tile` in the "Zuletzt bestellt" shortcuts. */
	variant?: "row" | "tile";
}

/**
 * One tap target per drink (at least 64 px high): tapping anywhere opens
 * the order drawer. Unavailable drinks render disabled.
 */
export function DrinkButton({
	drink,
	onSelect,
	variant = "row",
}: DrinkButtonProps) {
	const available = drink.isCurrentlyAvailable;
	return (
		<button
			type="button"
			onClick={() => onSelect(drink)}
			disabled={!available}
			data-drink={drink.name}
			className={cn(
				"flex w-full touch-manipulation select-none items-center gap-3 rounded-lg border bg-card text-left text-card-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-muted disabled:cursor-not-allowed disabled:bg-muted/40 disabled:text-muted-foreground",
				variant === "row" ? "min-h-16 p-2 pr-3" : "min-h-14 px-3 py-2",
			)}
		>
			{variant === "row" ? (
				<Image
					src={drink.picture || "/placeholder.svg"}
					alt=""
					width={56}
					height={56}
					className={cn(
						"size-14 shrink-0 rounded-md bg-muted object-cover",
						!available && "grayscale",
					)}
				/>
			) : null}
			<span className="min-w-0 flex-1">
				<span className="line-clamp-2 font-medium leading-tight">
					{drink.name}
				</span>
				<span
					className={cn(
						"mt-0.5 block text-sm tabular-nums",
						available ? "text-muted-foreground" : "",
					)}
				>
					{available ? formatEUR(drink.price) : "Nicht verfügbar"}
				</span>
			</span>
			{available ? (
				<span
					aria-hidden
					className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
				>
					<Plus className="size-5" />
				</span>
			) : null}
		</button>
	);
}
