"use client";

import { BarLegend, StackedBar } from "~/components/ui/stacked-bar";
import { StatusBadge } from "~/components/ui/status-badge";
import { formatEUR } from "~/lib/format";
import type { StatusTone } from "~/lib/status";
import { cn } from "~/lib/utils";
import type {
	BudgetStatus,
	EtaplanOverview,
} from "~/server/actions/cc-kasse/overview";
import { budgetBar } from "./budget";

const BUDGET_STATUS: Record<BudgetStatus, { label: string; tone: StatusTone }> =
	{
		"on-track": { label: "Im Plan", tone: "success" },
		warning: { label: "Achtung", tone: "warning" },
		"over-budget": { label: "Über Budget", tone: "danger" },
	};

/** Headline card: what is left of the total budget, with a stacked bar. */
export function HeroCard({
	total,
	eingereicht,
	className,
}: {
	total: EtaplanOverview["total"];
	eingereicht: number;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-2xl border bg-card p-5 shadow-xs",
				className,
			)}
		>
			<div className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-primary/5 blur-2xl" />
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-muted-foreground text-sm">Noch übrig</p>
					<p
						className={cn(
							"mt-0.5 font-bold text-3xl tabular-nums tracking-tight sm:text-4xl",
							total.verbleibend < 0 && "text-destructive",
						)}
					>
						{formatEUR(total.verbleibend)}
					</p>
					<p className="mt-1 text-muted-foreground text-sm tabular-nums">
						von {formatEUR(total.budget)} · {Math.round(total.auslastung)} %
						ausgegeben
					</p>
				</div>
				<StatusBadge
					tone={BUDGET_STATUS[total.status].tone}
					className="font-medium"
				>
					{BUDGET_STATUS[total.status].label}
				</StatusBadge>
			</div>

			<StackedBar
				className="mt-5"
				size="lg"
				{...budgetBar(
					total.budget,
					total.ausgegeben,
					total.genehmigt,
					eingereicht,
				)}
			/>
			<div className="mt-3">
				<BarLegend
					items={[
						{
							label: "Ausgezahlt",
							value: formatEUR(total.ausgegeben),
							swatch: "solid",
						},
						...(total.genehmigt > 0
							? [
									{
										label: "Genehmigt",
										value: formatEUR(total.genehmigt),
										swatch: "soft" as const,
									},
								]
							: []),
						...(eingereicht > 0
							? [
									{
										label: "Eingereicht",
										value: formatEUR(eingereicht),
										swatch: "hatched" as const,
									},
								]
							: []),
					]}
				/>
			</div>
			{total.genehmigt + eingereicht > 0 && (
				<p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-muted-foreground text-xs">
					Nach allen offenen Anträgen bleiben{" "}
					<span
						className={cn(
							"font-semibold tabular-nums",
							total.verbleibend - total.genehmigt - eingereicht < 0
								? "text-destructive"
								: "text-foreground",
						)}
					>
						{formatEUR(total.verbleibend - total.genehmigt - eingereicht)}
					</span>{" "}
					übrig.
				</p>
			)}
		</div>
	);
}
