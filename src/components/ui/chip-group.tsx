"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "~/lib/utils";

export type ChipOption<T extends string> = {
	value: T;
	label: string;
	/** Shown in a small pill after the label, e.g. open items per filter. */
	count?: number;
};

type ChipGroupProps<T extends string> = {
	options: readonly ChipOption<T>[];
	value: T;
	onValueChange: (value: T) => void;
	/**
	 * `default`: 36 px chips with an invisible 44 px tall hit area, for
	 * filters. `lg`: 44 px chips, for the main choice of a touch flow.
	 */
	size?: "default" | "lg";
	/**
	 * Let the row scroll to the screen edge on phones (cancels the page's
	 * 16 px padding). Use it when the chips sit directly in the page padding.
	 */
	bleed?: boolean;
	disabled?: boolean;
	className?: string;
} & (
	| { "aria-label": string; "aria-labelledby"?: never }
	| { "aria-labelledby": string; "aria-label"?: never }
);

/**
 * The one filter-chip / segmented control (#87): a single-choice row of
 * pills that scrolls sideways on phones instead of wrapping. It is a radio
 * group: one Tab stop, arrow keys move between chips and select them, Home
 * and End jump to the ends. Needs an accessible name (`aria-label` or
 * `aria-labelledby`).
 */
export function ChipGroup<T extends string>({
	options,
	value,
	onValueChange,
	size = "default",
	bleed = false,
	disabled,
	className,
	...labelling
}: ChipGroupProps<T>) {
	return (
		<RadioGroupPrimitive.Root
			data-slot="chip-group"
			value={value}
			onValueChange={(v) => onValueChange(v as T)}
			disabled={disabled}
			{...labelling}
			className={cn(
				// The padding keeps the 44 px hit areas and the focus ring inside
				// the scroll box, which would clip them; the negative margin hides it.
				"-m-1 flex min-w-0 gap-1.5 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
				bleed && "-mx-4 px-4 md:-mx-1 md:px-1",
				className,
			)}
		>
			{options.map((o) => (
				<Chip key={o.value} option={o} size={size} />
			))}
		</RadioGroupPrimitive.Root>
	);
}

function Chip<T extends string>({
	option,
	size,
}: {
	option: ChipOption<T>;
	size: "default" | "lg";
}) {
	return (
		<RadioGroupPrimitive.Item
			value={option.value}
			data-slot="chip"
			className={cn(
				"group/chip relative inline-flex min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border bg-background px-3 font-medium text-muted-foreground text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
				"data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
				size === "default" &&
					"h-9 after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2",
				size === "lg" && "h-11",
			)}
		>
			{option.label}
			{option.count !== undefined && (
				<span className="rounded-full bg-muted px-1.5 text-foreground text-xs tabular-nums group-data-[state=checked]/chip:bg-primary-foreground/20 group-data-[state=checked]/chip:text-primary-foreground">
					{option.count}
				</span>
			)}
		</RadioGroupPrimitive.Item>
	);
}
