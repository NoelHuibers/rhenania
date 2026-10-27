"use client";

import { cn } from "~/lib/utils";

// Small shared building blocks for the CC-Kasse tabs.

export type ChipOption<T extends string> = {
	value: T;
	label: string;
	count?: number;
};

// Horizontally scrollable pill filter — thumb-friendly replacement for a
// Select on phones, shows counts so you see where the work is at a glance.
export function FilterChips<T extends string>({
	options,
	value,
	onChange,
	className,
}: {
	options: ChipOption<T>[];
	value: T;
	onChange: (v: T) => void;
	className?: string;
}) {
	return (
		<div
			role="radiogroup"
			className={cn(
				"-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden",
				className,
			)}
		>
			{options.map((o) => {
				const active = o.value === value;
				return (
					<button
						key={o.value}
						type="button"
						role="radio"
						aria-checked={active}
						onClick={() => onChange(o.value)}
						className={cn(
							"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 font-medium text-sm transition-colors",
							active
								? "border-primary bg-primary text-primary-foreground"
								: "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						{o.label}
						{o.count !== undefined && (
							<span
								className={cn(
									"rounded-full px-1.5 text-xs tabular-nums",
									active ? "bg-primary-foreground/20" : "bg-muted",
								)}
							>
								{o.count}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

// Stacked budget bar: paid (solid) · approved (lighter) · submitted
// (striped) against the budget. Overspend turns the paid part red and
// marks where the budget line was.
export function BudgetBar({
	budget,
	ausgegeben,
	genehmigt = 0,
	eingereicht = 0,
	size = "md",
	className,
}: {
	budget: number;
	ausgegeben: number;
	genehmigt?: number;
	eingereicht?: number;
	size?: "sm" | "md" | "lg";
	className?: string;
}) {
	const used = ausgegeben + genehmigt + eingereicht;
	const scale = Math.max(budget, used, 0.01);
	const pct = (n: number) => `${Math.max(0, (n / scale) * 100)}%`;
	const over = ausgegeben + genehmigt > budget + 0.005;

	return (
		<div
			className={cn(
				"relative flex w-full overflow-hidden rounded-full bg-muted",
				size === "sm" && "h-1.5",
				size === "md" && "h-2",
				size === "lg" && "h-3",
				className,
			)}
		>
			<div
				className={cn(
					"h-full transition-all",
					over ? "bg-danger text-danger-foreground" : "bg-primary",
				)}
				style={{ width: pct(ausgegeben) }}
			/>
			<div
				className={cn(
					"h-full transition-all",
					over ? "bg-danger/50" : "bg-primary/40",
				)}
				style={{ width: pct(genehmigt) }}
			/>
			<div
				className="h-full bg-[repeating-linear-gradient(135deg,var(--color-amber-400)_0_3px,transparent_3px_6px)] opacity-70 transition-all"
				style={{ width: pct(eingereicht) }}
			/>
			{used > budget && budget > 0 && (
				<div
					className="absolute inset-y-0 w-0.5 bg-background"
					style={{ left: pct(budget) }}
				/>
			)}
		</div>
	);
}

export function BarLegend({
	items,
}: {
	items: {
		label: string;
		value: string;
		swatch: "paid" | "approved" | "submitted" | "free";
	}[];
}) {
	return (
		<div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
			{items.map((i) => (
				<div key={i.label} className="flex items-center gap-1.5">
					<span
						className={cn(
							"size-2.5 shrink-0 rounded-full",
							i.swatch === "paid" && "bg-primary",
							i.swatch === "approved" && "bg-primary/40",
							i.swatch === "submitted" &&
								"bg-[repeating-linear-gradient(135deg,var(--color-amber-400)_0_2px,transparent_2px_4px)]",
							i.swatch === "free" && "bg-muted ring-1 ring-border ring-inset",
						)}
					/>
					<span className="text-muted-foreground">{i.label}</span>
					<span className="font-medium tabular-nums">{i.value}</span>
				</div>
			))}
		</div>
	);
}
