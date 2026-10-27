"use client";

import { Progress } from "~/components/ui/progress";
import { formatEUR } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { EtaplanOverview } from "~/server/actions/cc-kasse/overview";
import { incomePct } from "./budget";

// Income mirror of the Kostenpunkte list: how much of the planned income has
// come in per Kostenpunkt, and how much is still missing.
export function EinnahmenSection({ overview }: { overview: EtaplanOverview }) {
	const rows = overview.kostenpunkte.filter(
		(k) => k.income > 0 || k.istEinnahmen > 0,
	);
	if (rows.length === 0) {
		return null;
	}

	const geplant = overview.geplanteEinnahmen;
	const erhalten = overview.total.istEinnahmen;
	const fehlt = Math.max(0, geplant - erhalten);

	return (
		<section className="space-y-3">
			<div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
				<h2 className="font-semibold text-base">Einnahmen</h2>
				<p className="text-muted-foreground text-xs tabular-nums">
					<span className="font-semibold text-success">
						{formatEUR(erhalten)}
					</span>{" "}
					von {formatEUR(geplant)}
					{fehlt > 0 && (
						<>
							{" · "}
							<span className="font-semibold text-warning-muted-foreground">
								{formatEUR(fehlt)} fehlen
							</span>
						</>
					)}
				</p>
			</div>
			<ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
				{rows.map((k) => {
					const pct = incomePct(k.income, k.istEinnahmen);
					const rowFehlt = Math.max(0, k.income - k.istEinnahmen);
					return (
						<li key={k.id} className="px-4 py-3">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="truncate font-medium text-sm">{k.name}</div>
									<div className="truncate text-muted-foreground text-xs">
										{k.category}
									</div>
								</div>
								<div className="shrink-0 text-right">
									<div className="font-semibold text-sm tabular-nums">
										{formatEUR(k.istEinnahmen)}
										<span className="font-normal text-muted-foreground">
											{" "}
											/ {formatEUR(k.income)}
										</span>
									</div>
									<div
										className={cn(
											"text-xs",
											rowFehlt > 0
												? "text-warning-muted-foreground"
												: "text-success",
										)}
									>
										{rowFehlt > 0
											? `${formatEUR(rowFehlt)} fehlen`
											: "vollständig"}
									</div>
								</div>
							</div>
							<Progress
								className="mt-2 [&>[data-slot=progress-indicator]]:bg-success"
								value={Math.min(pct, 100)}
							/>
						</li>
					);
				})}
			</ul>
			<p className="text-muted-foreground text-xs">
				Erhalten = gebuchte Einnahmen plus bezahlte Semesterbeiträge des
				verknüpften Kostenpunkts.
			</p>
		</section>
	);
}
