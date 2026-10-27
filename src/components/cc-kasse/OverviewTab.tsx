"use client";

import {
	ChevronsDownUp,
	ChevronsUpDown,
	HandCoins,
	Landmark,
	PiggyBank,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/empty-state";
import { Progress } from "~/components/ui/progress";
import { SectionCard } from "~/components/ui/section-card";
import { StatTile } from "~/components/ui/stat-tile";
import { formatEUR } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { QueueReimbursement } from "~/server/actions/cc-kasse/kostenerstattungen";
import type { EtaplanOverview } from "~/server/actions/cc-kasse/overview";
import { incomePct, remainingTone } from "./overview/budget";
import { EinnahmenSection } from "./overview/EinnahmenSection";
import { HeroCard } from "./overview/HeroCard";
import { KostenpunktRow, type KpExtras } from "./overview/KostenpunktRow";

export function OverviewTab({
	overview,
	queue,
}: {
	overview: EtaplanOverview | null;
	queue: QueueReimbursement[];
}) {
	const [open, setOpen] = useState<Set<string>>(new Set());

	// Reimbursements per Kostenpunkt for the drill-down. Rejected ones don't
	// touch the budget, so they're only counted, not listed.
	const byKp = useMemo(() => {
		const map = new Map<string, KpExtras>();
		for (const r of queue) {
			const e = map.get(r.kostenpunktId) ?? {
				items: [],
				eingereicht: 0,
				abgelehnt: 0,
			};
			if (r.status === "Abgelehnt") {
				e.abgelehnt++;
			} else {
				e.items.push(r);
			}
			if (r.status === "Eingereicht") {
				e.eingereicht += r.amount;
			}
			map.set(r.kostenpunktId, e);
		}
		for (const e of map.values()) {
			e.items.sort(
				(a, b) =>
					new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime(),
			);
		}
		return map;
	}, [queue]);

	if (!overview || overview.kostenpunkte.length === 0) {
		return (
			<EmptyState
				icon={<Landmark className="size-5" />}
				title="Noch keine Kostenpunkte"
			>
				Lege im Tab „Etatplan“ Kostenpunkte an, dann siehst du hier, wie viel
				Budget noch übrig ist.
			</EmptyState>
		);
	}

	const { total, categories, kostenpunkte } = overview;
	const totalEingereicht = queue
		.filter((r) => r.status === "Eingereicht")
		.reduce((s, r) => s + r.amount, 0);
	const allOpen = open.size === kostenpunkte.length;

	const toggle = (id: string, next: boolean) =>
		setOpen((prev) => {
			const s = new Set(prev);
			if (next) {
				s.add(id);
			} else {
				s.delete(id);
			}
			return s;
		});

	return (
		<div className="space-y-6">
			<div className="grid gap-3 lg:grid-cols-3">
				<HeroCard
					total={total}
					eingereicht={totalEingereicht}
					className="lg:col-span-2"
				/>
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
					<StatTile
						icon={<PiggyBank />}
						label="Einnahmen"
						value={formatEUR(total.istEinnahmen)}
						tone="success"
						hint={`von ${formatEUR(overview.geplanteEinnahmen)} geplant`}
					>
						<Progress
							className="mt-2 [&>[data-slot=progress-indicator]]:bg-success"
							value={Math.min(
								incomePct(overview.geplanteEinnahmen, total.istEinnahmen),
								100,
							)}
							aria-label="Anteil der geplanten Einnahmen erhalten"
						/>
					</StatTile>
					<StatTile
						icon={<HandCoins />}
						label="AHV-Zuschuss"
						value={formatEUR(overview.geplanterZuschuss)}
						hint="geplant (Ausgaben − Einnahmen)"
					/>
				</div>
			</div>

			<section className="space-y-3">
				<div className="flex items-end justify-between gap-2">
					<div>
						<h2 className="font-semibold text-base">Kostenpunkte</h2>
						<p className="text-muted-foreground text-xs">
							Öffne einen Kostenpunkt, um die einzelnen Erstattungen zu sehen.
						</p>
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="shrink-0 text-muted-foreground"
						onClick={() =>
							setOpen(
								allOpen ? new Set() : new Set(kostenpunkte.map((k) => k.id)),
							)
						}
					>
						{allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
						<span className="hidden sm:inline">
							{allOpen ? "Alle zuklappen" : "Alle aufklappen"}
						</span>
					</Button>
				</div>

				{categories.map((cat) => {
					const items = kostenpunkte.filter((k) => k.category === cat.category);
					return (
						<SectionCard
							key={cat.category}
							title={cat.category}
							meta={`${formatEUR(cat.ausgegeben)} von ${formatEUR(cat.budget)}`}
							aside={
								<>
									<div
										className={cn(
											"font-semibold text-sm tabular-nums",
											remainingTone(cat.verbleibend, cat.budget),
										)}
									>
										{formatEUR(cat.verbleibend)}
									</div>
									<div className="text-muted-foreground text-xs">übrig</div>
								</>
							}
						>
							<ul className="divide-y">
								{items.map((k) => (
									<KostenpunktRow
										key={k.id}
										kp={k}
										extras={byKp.get(k.id)}
										open={open.has(k.id)}
										onOpenChange={(o) => toggle(k.id, o)}
									/>
								))}
							</ul>
						</SectionCard>
					);
				})}
			</section>

			<EinnahmenSection overview={overview} />
		</div>
	);
}
