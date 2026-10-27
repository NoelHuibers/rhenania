import { cn } from "~/lib/utils";

/**
 * How a part of the bar is drawn. `solid` is what is done (paid, spent),
 * `soft` what is committed (approved), `hatched` what is only requested
 * (submitted). `empty` is only used in the legend, for the unused rest.
 */
export type BarSwatch = "solid" | "soft" | "hatched" | "empty";

type BarTone = "primary" | "danger";

// The hatching uses the warning token so it reads as "pending" in both themes.
const HATCH =
	"bg-[repeating-linear-gradient(135deg,var(--color-warning)_0_3px,transparent_3px_6px)] opacity-70";

const SWATCH: Record<BarTone, Record<BarSwatch, string>> = {
	primary: {
		solid: "bg-primary",
		soft: "bg-primary/40",
		hatched: HATCH,
		empty: "bg-muted ring-1 ring-border ring-inset",
	},
	danger: {
		solid: "bg-danger",
		soft: "bg-danger/50",
		hatched: HATCH,
		empty: "bg-muted ring-1 ring-border ring-inset",
	},
};

export type BarSegment = {
	value: number;
	swatch: Exclude<BarSwatch, "empty">;
};

/**
 * A horizontal bar of stacked parts against a limit (e.g. a budget). When
 * the parts add up to more than `max`, the bar is scaled to the total and a
 * notch marks where the limit was. `tone="danger"` paints the solid and soft
 * parts red, for an overspent limit.
 *
 * The bar is decorative (hidden from screen readers) unless it gets a
 * `label`; put the numbers next to it as text, e.g. with BarLegend.
 */
export function StackedBar({
	max,
	segments,
	tone = "primary",
	size = "md",
	label,
	className,
}: {
	max: number;
	segments: readonly BarSegment[];
	tone?: BarTone;
	size?: "sm" | "md" | "lg";
	/** Text alternative; without it the bar is aria-hidden. */
	label?: string;
	className?: string;
}) {
	const used = segments.reduce((s, x) => s + x.value, 0);
	const scale = Math.max(max, used, 0.01);
	const pct = (n: number) => `${Math.max(0, (n / scale) * 100)}%`;

	return (
		<div
			data-slot="stacked-bar"
			{...(label
				? { role: "img", "aria-label": label }
				: { "aria-hidden": true })}
			className={cn(
				"relative flex w-full overflow-hidden rounded-full bg-muted",
				size === "sm" && "h-1.5",
				size === "md" && "h-2",
				size === "lg" && "h-3",
				className,
			)}
		>
			{segments.map((s, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
					key={i}
					className={cn("h-full transition-all", SWATCH[tone][s.swatch])}
					style={{ width: pct(s.value) }}
				/>
			))}
			{used > max && max > 0 && (
				<div
					className="absolute inset-y-0 w-0.5 bg-background"
					style={{ left: pct(max) }}
				/>
			)}
		</div>
	);
}

/** The key for a StackedBar: swatch, label and value per part. */
export function BarLegend({
	items,
	tone = "primary",
	className,
}: {
	items: readonly { label: string; value: string; swatch: BarSwatch }[];
	tone?: BarTone;
	className?: string;
}) {
	return (
		<ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-xs", className)}>
			{items.map((i) => (
				<li key={i.label} className="flex items-center gap-1.5">
					<span
						aria-hidden="true"
						className={cn(
							"size-2.5 shrink-0 rounded-full",
							SWATCH[tone][i.swatch],
							i.swatch === "hatched" && "opacity-100",
						)}
					/>
					<span className="text-muted-foreground">{i.label}</span>
					<span className="font-medium tabular-nums">{i.value}</span>
				</li>
			))}
		</ul>
	);
}
