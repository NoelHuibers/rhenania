"use client";

import {
	ChevronDown,
	ChevronsDownUp,
	ChevronsUpDown,
	FileText,
	HandCoins,
	Landmark,
	PiggyBank,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Progress } from "~/components/ui/progress";
import { formatEur } from "~/lib/cc-kasse-format";
import { cn } from "~/lib/utils";
import type { QueueReimbursement } from "~/server/actions/cc-kasse/kostenerstattungen";
import type {
	BudgetStatus,
	EtaplanOverview,
	KostenpunktOverview,
} from "~/server/actions/cc-kasse/overview";
import { BarLegend, BudgetBar, EmptyState, formatDate } from "./KasseUi";
import { ReimbursementStatusBadge } from "./ReimbursementStatusBadge";

const STATUS_META: Record<BudgetStatus, { label: string; cls: string }> = {
	"on-track": {
		label: "Im Plan",
		cls: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300",
	},
	warning: {
		label: "Achtung",
		cls: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300",
	},
	"over-budget": {
		label: "Über Budget",
		cls: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300",
	},
};

function StatusBadge({ status }: { status: BudgetStatus }) {
	const m = STATUS_META[status];
	return (
		<Badge variant="outline" className={cn("font-medium", m.cls)}>
			{m.label}
		</Badge>
	);
}

function remainingTone(verbleibend: number, budget: number) {
	if (verbleibend < 0) return "text-red-600 dark:text-red-400";
	if (budget > 0 && verbleibend / budget < 0.2)
		return "text-amber-600 dark:text-amber-400";
	return "text-emerald-600 dark:text-emerald-400";
}

type KpExtras = {
	items: QueueReimbursement[];
	eingereicht: number;
	abgelehnt: number;
};

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
			if (r.status === "Abgelehnt") e.abgelehnt++;
			else e.items.push(r);
			if (r.status === "Eingereicht") e.eingereicht += r.amount;
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
			if (next) s.add(id);
			else s.delete(id);
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
					<IncomeTile
						geplant={overview.geplanteEinnahmen}
						erhalten={total.istEinnahmen}
					/>
					<StatTile
						icon={<HandCoins className="size-4" />}
						label="AHV-Zuschuss"
						value={formatEur(overview.geplanterZuschuss)}
						sub="geplant (Ausgaben − Einnahmen)"
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
						<div
							key={cat.category}
							className="overflow-hidden rounded-xl border bg-card shadow-xs"
						>
							<div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2.5">
								<div className="min-w-0">
									<div className="truncate font-semibold text-sm">
										{cat.category}
									</div>
									<div className="text-muted-foreground text-xs tabular-nums">
										{formatEur(cat.ausgegeben)} von {formatEur(cat.budget)}
									</div>
								</div>
								<div className="shrink-0 text-right">
									<div
										className={cn(
											"font-semibold text-sm tabular-nums",
											remainingTone(cat.verbleibend, cat.budget),
										)}
									>
										{formatEur(cat.verbleibend)}
									</div>
									<div className="text-muted-foreground text-xs">übrig</div>
								</div>
							</div>
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
						</div>
					);
				})}
			</section>

			<EinnahmenSection overview={overview} />
		</div>
	);
}

function HeroCard({
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
							total.verbleibend < 0 && "text-red-600 dark:text-red-400",
						)}
					>
						{formatEur(total.verbleibend)}
					</p>
					<p className="mt-1 text-muted-foreground text-sm tabular-nums">
						von {formatEur(total.budget)} · {Math.round(total.auslastung)} %
						ausgegeben
					</p>
				</div>
				<StatusBadge status={total.status} />
			</div>

			<BudgetBar
				className="mt-5"
				size="lg"
				budget={total.budget}
				ausgegeben={total.ausgegeben}
				genehmigt={total.genehmigt}
				eingereicht={eingereicht}
			/>
			<div className="mt-3">
				<BarLegend
					items={[
						{
							label: "Ausgezahlt",
							value: formatEur(total.ausgegeben),
							swatch: "paid",
						},
						...(total.genehmigt > 0
							? [
									{
										label: "Genehmigt",
										value: formatEur(total.genehmigt),
										swatch: "approved" as const,
									},
								]
							: []),
						...(eingereicht > 0
							? [
									{
										label: "Eingereicht",
										value: formatEur(eingereicht),
										swatch: "submitted" as const,
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
								? "text-red-600 dark:text-red-400"
								: "text-foreground",
						)}
					>
						{formatEur(total.verbleibend - total.genehmigt - eingereicht)}
					</span>{" "}
					übrig.
				</p>
			)}
		</div>
	);
}

function IncomeTile({
	geplant,
	erhalten,
}: {
	geplant: number;
	erhalten: number;
}) {
	const pct = incomePct(geplant, erhalten);
	return (
		<div className="rounded-2xl border bg-card p-4 shadow-xs">
			<div className="flex items-center gap-2 text-muted-foreground text-xs">
				<PiggyBank className="size-4" /> Einnahmen
			</div>
			<p className="mt-1 font-semibold text-emerald-600 text-lg tabular-nums sm:text-xl dark:text-emerald-400">
				{formatEur(erhalten)}
			</p>
			<p className="text-muted-foreground text-xs tabular-nums">
				von {formatEur(geplant)} geplant
			</p>
			<Progress
				className="mt-2 [&>[data-slot=progress-indicator]]:bg-emerald-500"
				value={Math.min(pct, 100)}
			/>
		</div>
	);
}

function StatTile({
	icon,
	label,
	value,
	sub,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<div className="rounded-2xl border bg-card p-4 shadow-xs">
			<div className="flex items-center gap-2 text-muted-foreground text-xs">
				{icon} <span className="truncate">{label}</span>
			</div>
			<p className="mt-1 font-semibold text-lg tabular-nums sm:text-xl">
				{value}
			</p>
			{sub && <p className="text-muted-foreground text-xs">{sub}</p>}
		</div>
	);
}

function KostenpunktRow({
	kp,
	extras,
	open,
	onOpenChange,
}: {
	kp: KostenpunktOverview;
	extras: KpExtras | undefined;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const items = extras?.items ?? [];
	const eingereicht = extras?.eingereicht ?? 0;
	const count = items.length;

	return (
		<li>
			<Collapsible open={open} onOpenChange={onOpenChange}>
				<CollapsibleTrigger className="group w-full px-4 py-3 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/60">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="truncate font-medium text-sm">{kp.name}</div>
							<div className="text-muted-foreground text-xs">
								{count === 0
									? "Keine Erstattungen"
									: `${count} ${count === 1 ? "Erstattung" : "Erstattungen"}`}
								{kp.genehmigt + eingereicht > 0 && (
									<span className="text-amber-600 dark:text-amber-400">
										{" "}
										· {formatEur(kp.genehmigt + eingereicht)} offen
									</span>
								)}
							</div>
						</div>
						<div className="flex shrink-0 items-start gap-2">
							<div className="text-right">
								<div
									className={cn(
										"font-semibold text-sm tabular-nums",
										remainingTone(kp.verbleibend, kp.budget),
									)}
								>
									{formatEur(kp.verbleibend)}
								</div>
								<div className="text-muted-foreground text-xs tabular-nums">
									von {formatEur(kp.budget)}
								</div>
							</div>
							<ChevronDown className="mt-0.5 size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
						</div>
					</div>
					<BudgetBar
						className="mt-2.5"
						size="sm"
						budget={kp.budget}
						ausgegeben={kp.ausgegeben}
						genehmigt={kp.genehmigt}
						eingereicht={eingereicht}
					/>
				</CollapsibleTrigger>

				<CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
					<div className="space-y-3 bg-muted/20 px-4 pt-1 pb-4">
						<dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
							<MiniStat label="Budget" value={kp.budget} />
							<MiniStat label="Ausgezahlt" value={kp.ausgegeben} />
							{kp.genehmigt > 0 && (
								<MiniStat label="Genehmigt" value={kp.genehmigt} />
							)}
							{eingereicht > 0 && (
								<MiniStat label="Eingereicht" value={eingereicht} />
							)}
						</dl>

						{items.length === 0 ? (
							<p className="py-3 text-center text-muted-foreground text-xs">
								Auf diesen Kostenpunkt wurde noch nichts gebucht.
							</p>
						) : (
							<ul className="divide-y overflow-hidden rounded-lg border bg-background">
								{items.map((r) => (
									<ErstattungItem key={r.id} r={r} />
								))}
							</ul>
						)}
						{(extras?.abgelehnt ?? 0) > 0 && (
							<p className="text-muted-foreground text-xs">
								{extras?.abgelehnt} abgelehnte{" "}
								{extras?.abgelehnt === 1 ? "Antrag" : "Anträge"} nicht
								mitgezählt.
							</p>
						)}
					</div>
				</CollapsibleContent>
			</Collapsible>
		</li>
	);
}

function MiniStat({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-lg bg-background px-3 py-2 ring-1 ring-border">
			<dt className="text-muted-foreground text-xs">{label}</dt>
			<dd className="font-medium text-sm tabular-nums">{formatEur(value)}</dd>
		</div>
	);
}

function ErstattungItem({ r }: { r: QueueReimbursement }) {
	const receipts = r.receipts?.length
		? r.receipts
		: r.receiptUrl
			? [{ url: r.receiptUrl, name: r.receiptName ?? "Beleg" }]
			: [];
	const who =
		r.source === "Direktbuchung"
			? "Direktbuchung"
			: (r.submitter?.name ?? r.recipientName);

	return (
		<li className="flex items-start gap-3 px-3 py-2.5">
			<div className="min-w-0 flex-1">
				<p className="line-clamp-2 text-sm">{r.description}</p>
				<p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-muted-foreground text-xs">
					<span>{formatDate(r.expenseDate)}</span>
					<span aria-hidden>·</span>
					<span className="truncate">{who}</span>
					{receipts.map((f, i) => (
						<a
							key={f.url}
							href={f.url}
							target="_blank"
							rel="noopener noreferrer"
							onClick={(e) => e.stopPropagation()}
							className="inline-flex items-center gap-0.5 text-primary hover:underline"
						>
							<FileText className="size-3" />
							{receipts.length > 1 ? `Beleg ${i + 1}` : "Beleg"}
						</a>
					))}
				</p>
			</div>
			<div className="flex shrink-0 flex-col items-end gap-1">
				<span className="font-semibold text-sm tabular-nums">
					{formatEur(r.amount)}
				</span>
				{r.status !== "Ausgezahlt" && (
					<ReimbursementStatusBadge status={r.status} />
				)}
			</div>
		</li>
	);
}

// Income mirror of the Kostenpunkte list: how much of the planned income has
// come in per Kostenpunkt, and how much is still missing.
function EinnahmenSection({ overview }: { overview: EtaplanOverview }) {
	const rows = overview.kostenpunkte.filter(
		(k) => k.income > 0 || k.istEinnahmen > 0,
	);
	if (rows.length === 0) return null;

	const geplant = overview.geplanteEinnahmen;
	const erhalten = overview.total.istEinnahmen;
	const fehlt = Math.max(0, geplant - erhalten);

	return (
		<section className="space-y-3">
			<div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
				<h2 className="font-semibold text-base">Einnahmen</h2>
				<p className="text-muted-foreground text-xs tabular-nums">
					<span className="font-semibold text-emerald-600 dark:text-emerald-400">
						{formatEur(erhalten)}
					</span>{" "}
					von {formatEur(geplant)}
					{fehlt > 0 && (
						<>
							{" · "}
							<span className="font-semibold text-amber-600 dark:text-amber-400">
								{formatEur(fehlt)} fehlen
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
										{formatEur(k.istEinnahmen)}
										<span className="font-normal text-muted-foreground">
											{" "}
											/ {formatEur(k.income)}
										</span>
									</div>
									<div
										className={cn(
											"text-xs",
											rowFehlt > 0
												? "text-amber-600 dark:text-amber-400"
												: "text-emerald-600 dark:text-emerald-400",
										)}
									>
										{rowFehlt > 0
											? `${formatEur(rowFehlt)} fehlen`
											: "vollständig"}
									</div>
								</div>
							</div>
							<Progress
								className="mt-2 [&>[data-slot=progress-indicator]]:bg-emerald-500"
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

function incomePct(income: number, ist: number): number {
	return income > 0 ? Math.round((ist / income) * 100) : ist > 0 ? 100 : 0;
}
