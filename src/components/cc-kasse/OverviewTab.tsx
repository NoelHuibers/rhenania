"use client";

import { Clock, PiggyBank, TrendingDown, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "~/components/ui/chart";
import { Progress } from "~/components/ui/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { formatEur } from "~/lib/cc-kasse-format";
import { cn } from "~/lib/utils";
import type {
	BudgetStatus,
	EtaplanOverview,
} from "~/server/actions/cc-kasse/overview";

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

const chartConfig = {
	budget: { label: "Budget", color: "hsl(var(--chart-1))" },
	ausgegeben: { label: "Ausgegeben", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

export function OverviewTab({
	overview,
}: {
	overview: EtaplanOverview | null;
}) {
	if (!overview || overview.kostenpunkte.length === 0) {
		return (
			<p className="py-8 text-center text-muted-foreground text-sm">
				Noch keine Kostenpunkte im Etatplan.
			</p>
		);
	}

	const { total, categories, kostenpunkte } = overview;
	const chartData = categories.map((c) => ({
		category: c.category,
		budget: c.budget,
		ausgegeben: c.ausgegeben,
	}));

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<SummaryCard
					icon={<Wallet className="h-5 w-5" />}
					accent="bg-primary/10 text-primary"
					title="Budget (Ausgaben)"
					value={formatEur(total.budget)}
				/>
				<SummaryCard
					icon={<TrendingDown className="h-5 w-5" />}
					accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
					title="Ausgegeben"
					value={formatEur(total.ausgegeben)}
					sub={`${total.auslastung}% ausgelastet`}
					badge={<StatusBadge status={total.status} />}
				/>
				<SummaryCard
					icon={<Clock className="h-5 w-5" />}
					accent="bg-sky-500/10 text-sky-600 dark:text-sky-400"
					title="Genehmigt (offen)"
					value={formatEur(total.genehmigt)}
				/>
				<SummaryCard
					icon={<PiggyBank className="h-5 w-5" />}
					accent={
						total.verbleibend < 0
							? "bg-red-500/10 text-red-600 dark:text-red-400"
							: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
					}
					title="Verbleibend"
					value={formatEur(total.verbleibend)}
					valueClass={
						total.verbleibend < 0 ? "text-red-600 dark:text-red-400" : ""
					}
				/>
			</div>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Plan-Saldo</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
						<SaldoItem
							label="Geplante Ausgaben"
							value={formatEur(total.budget)}
						/>
						<SaldoItem
							label="Geplante Einnahmen"
							value={formatEur(overview.geplanteEinnahmen)}
						/>
						<SaldoItem
							label="Ist-Einnahmen"
							value={formatEur(total.istEinnahmen)}
							accent="text-emerald-600 dark:text-emerald-400"
						/>
						<SaldoItem
							label="Zuschuss AHV (geplant)"
							value={formatEur(overview.geplanterZuschuss)}
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Budget vs. Ausgegeben je Kategorie
					</CardTitle>
				</CardHeader>
				<CardContent>
					<ChartContainer config={chartConfig} className="h-[280px] w-full">
						<BarChart accessibilityLayer data={chartData}>
							<CartesianGrid vertical={false} />
							<XAxis
								dataKey="category"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								tickFormatter={(v: string) =>
									v.length > 12 ? `${v.slice(0, 12)}…` : v
								}
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<Bar dataKey="budget" fill="var(--color-budget)" radius={4} />
							<Bar
								dataKey="ausgegeben"
								fill="var(--color-ausgegeben)"
								radius={4}
							/>
						</BarChart>
					</ChartContainer>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Kostenpunkte</CardTitle>
				</CardHeader>
				<CardContent>
					{/* Mobile: stacked cards per Kostenpunkt */}
					<div className="space-y-5 sm:hidden">
						{categories.map((cat) => (
							<div key={cat.category} className="space-y-2">
								<div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5">
									<span className="min-w-0 truncate font-medium text-sm">
										{cat.category}
									</span>
									<StatusBadge status={cat.status} />
								</div>
								{kostenpunkte
									.filter((k) => k.category === cat.category)
									.map((k) => (
										<div key={k.id} className="rounded-lg border p-3">
											<div className="flex items-center justify-between gap-2">
												<span className="min-w-0 truncate font-medium text-sm">
													{k.name}
												</span>
												<StatusBadge status={k.status} />
											</div>
											<div className="mt-2 grid grid-cols-3 gap-2 text-xs">
												<MobileAmount label="Budget" value={k.budget} />
												<MobileAmount label="Ausgegeben" value={k.ausgegeben} />
												<MobileAmount
													label="Verbleibend"
													value={k.verbleibend}
													negative={k.verbleibend < 0}
												/>
											</div>
											<Progress
												className="mt-2"
												value={Math.min(k.auslastung, 100)}
											/>
										</div>
									))}
								<div className="grid grid-cols-3 gap-2 px-2 text-xs">
									<MobileAmount label="Summe" value={cat.budget} />
									<MobileAmount label="" value={cat.ausgegeben} />
									<MobileAmount
										label=""
										value={cat.verbleibend}
										negative={cat.verbleibend < 0}
									/>
								</div>
							</div>
						))}
					</div>

					{/* Desktop: table */}
					<div className="hidden sm:block">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Kostenpunkt</TableHead>
									<TableHead className="text-right">Budget</TableHead>
									<TableHead className="text-right">Ausgegeben</TableHead>
									<TableHead className="text-right">Verbleibend</TableHead>
									<TableHead className="w-[160px]">Auslastung</TableHead>
									<TableHead>Status</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{categories.map((cat) => (
									<CategoryRows
										key={cat.category}
										category={cat.category}
										catBudget={cat.budget}
										catAusgegeben={cat.ausgegeben}
										catVerbleibend={cat.verbleibend}
										catAuslastung={cat.auslastung}
										catStatus={cat.status}
										items={kostenpunkte.filter(
											(k) => k.category === cat.category,
										)}
									/>
								))}
							</TableBody>
						</Table>
					</div>
				</CardContent>
			</Card>

			<EinnahmenPlanCard overview={overview} />
		</div>
	);
}

// Income mirror of the Kostenpunkte table: how much of the planned income has
// come in per Kostenpunkt, and how much is still missing.
function EinnahmenPlanCard({ overview }: { overview: EtaplanOverview }) {
	const rows = overview.kostenpunkte.filter(
		(k) => k.income > 0 || k.istEinnahmen > 0,
	);
	if (rows.length === 0) return null;

	const geplant = overview.geplanteEinnahmen;
	const erhalten = overview.total.istEinnahmen;
	const fehlt = Math.max(0, geplant - erhalten);
	const totalPct = incomePct(geplant, erhalten);

	return (
		<Card>
			<CardHeader className="flex flex-col gap-1 pb-2 sm:flex-row sm:items-center sm:justify-between">
				<CardTitle className="text-base">Einnahmen</CardTitle>
				<span className="text-muted-foreground text-sm">
					<span className="font-semibold text-emerald-600 dark:text-emerald-400">
						{formatEur(erhalten)}
					</span>{" "}
					von {formatEur(geplant)} erhalten ({totalPct}%)
					{fehlt > 0 && (
						<>
							{" · "}
							<span className="font-semibold text-amber-600 dark:text-amber-400">
								{formatEur(fehlt)} fehlen
							</span>
						</>
					)}
				</span>
			</CardHeader>
			<CardContent>
				{/* Mobile: stacked cards */}
				<div className="space-y-2 sm:hidden">
					{rows.map((k) => {
						const rowFehlt = Math.max(0, k.income - k.istEinnahmen);
						return (
							<div key={k.id} className="rounded-lg border p-3">
								<div className="flex items-center justify-between gap-2">
									<div className="min-w-0">
										<div className="truncate font-medium text-sm">{k.name}</div>
										<div className="truncate text-muted-foreground text-xs">
											{k.category}
										</div>
									</div>
									<IncomePctLabel income={k.income} ist={k.istEinnahmen} />
								</div>
								<div className="mt-2 grid grid-cols-3 gap-2 text-xs">
									<MobileAmount label="Geplant" value={k.income} />
									<MobileAmount label="Erhalten" value={k.istEinnahmen} />
									<MobileAmount
										label="Fehlt"
										value={rowFehlt}
										negative={rowFehlt > 0}
									/>
								</div>
								<Progress
									className="mt-2"
									value={Math.min(incomePct(k.income, k.istEinnahmen), 100)}
								/>
							</div>
						);
					})}
				</div>

				{/* Desktop: table */}
				<div className="hidden sm:block">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Kostenpunkt</TableHead>
								<TableHead className="text-right">Geplant</TableHead>
								<TableHead className="text-right">Erhalten</TableHead>
								<TableHead className="text-right">Fehlt</TableHead>
								<TableHead className="w-[160px]">Fortschritt</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((k) => {
								const rowFehlt = Math.max(0, k.income - k.istEinnahmen);
								return (
									<TableRow key={k.id}>
										<TableCell>
											<div className="font-medium">{k.name}</div>
											<div className="text-muted-foreground text-xs">
												{k.category}
											</div>
										</TableCell>
										<TableCell className="text-right">
											{formatEur(k.income)}
										</TableCell>
										<TableCell
											className={cn(
												"text-right",
												k.istEinnahmen > 0 &&
													"text-emerald-600 dark:text-emerald-400",
											)}
										>
											{formatEur(k.istEinnahmen)}
										</TableCell>
										<TableCell
											className={cn(
												"text-right",
												rowFehlt > 0 && "text-amber-600 dark:text-amber-400",
											)}
										>
											{formatEur(rowFehlt)}
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-2">
												<Progress
													className="flex-1"
													value={Math.min(
														incomePct(k.income, k.istEinnahmen),
														100,
													)}
												/>
												<IncomePctLabel
													income={k.income}
													ist={k.istEinnahmen}
												/>
											</div>
										</TableCell>
									</TableRow>
								);
							})}
							<TableRow className="bg-muted/50 font-medium">
								<TableCell>Gesamt</TableCell>
								<TableCell className="text-right">
									{formatEur(geplant)}
								</TableCell>
								<TableCell className="text-right text-emerald-600 dark:text-emerald-400">
									{formatEur(erhalten)}
								</TableCell>
								<TableCell
									className={cn(
										"text-right",
										fehlt > 0 && "text-amber-600 dark:text-amber-400",
									)}
								>
									{formatEur(fehlt)}
								</TableCell>
								<TableCell>
									<div className="flex items-center gap-2">
										<Progress
											className="flex-1"
											value={Math.min(totalPct, 100)}
										/>
										<IncomePctLabel income={geplant} ist={erhalten} />
									</div>
								</TableCell>
							</TableRow>
						</TableBody>
					</Table>
				</div>
				<p className="mt-3 text-muted-foreground text-xs">
					Erhalten = gebuchte Einnahmen plus bezahlte Semesterbeiträge des
					verknüpften Kostenpunkts.
				</p>
			</CardContent>
		</Card>
	);
}

function incomePct(income: number, ist: number): number {
	return income > 0 ? Math.round((ist / income) * 100) : ist > 0 ? 100 : 0;
}

function IncomePctLabel({ income, ist }: { income: number; ist: number }) {
	const pct = incomePct(income, ist);
	return (
		<span
			className={cn(
				"shrink-0 text-xs tabular-nums",
				pct >= 100
					? "font-medium text-emerald-600 dark:text-emerald-400"
					: "text-muted-foreground",
			)}
		>
			{pct}%
		</span>
	);
}

function SummaryCard({
	icon,
	accent,
	title,
	value,
	sub,
	badge,
	valueClass,
}: {
	icon: React.ReactNode;
	accent: string;
	title: string;
	value: string;
	sub?: string;
	badge?: React.ReactNode;
	valueClass?: string;
}) {
	return (
		<div className="flex items-start gap-3 rounded-xl border bg-card p-3 shadow-sm sm:p-4">
			<div
				className={cn(
					"hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:flex",
					accent,
				)}
			>
				{icon}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
					<p className="truncate text-muted-foreground text-xs">{title}</p>
					{badge}
				</div>
				<div
					className={cn(
						"mt-1 font-bold text-lg tabular-nums sm:text-2xl",
						valueClass,
					)}
				>
					{value}
				</div>
				{sub && <p className="text-muted-foreground text-xs">{sub}</p>}
			</div>
		</div>
	);
}

function MobileAmount({
	label,
	value,
	negative,
}: {
	label: string;
	value: number;
	negative?: boolean;
}) {
	return (
		<div className="min-w-0">
			<div className="truncate text-muted-foreground">{label || " "}</div>
			<div
				className={cn(
					"font-medium tabular-nums",
					negative && "text-red-600 dark:text-red-400",
				)}
			>
				{formatEur(value)}
			</div>
		</div>
	);
}

function SaldoItem({
	label,
	value,
	accent,
}: {
	label: string;
	value: string;
	accent?: string;
}) {
	return (
		<div>
			<div className="text-muted-foreground text-xs">{label}</div>
			<div className={cn("mt-0.5 font-semibold tabular-nums", accent)}>
				{value}
			</div>
		</div>
	);
}

function CategoryRows({
	category,
	catBudget,
	catAusgegeben,
	catVerbleibend,
	catAuslastung,
	catStatus,
	items,
}: {
	category: string;
	catBudget: number;
	catAusgegeben: number;
	catVerbleibend: number;
	catAuslastung: number;
	catStatus: BudgetStatus;
	items: EtaplanOverview["kostenpunkte"];
}) {
	return (
		<>
			<TableRow className="bg-muted/50 font-medium">
				<TableCell>{category}</TableCell>
				<TableCell className="text-right">{formatEur(catBudget)}</TableCell>
				<TableCell className="text-right">{formatEur(catAusgegeben)}</TableCell>
				<TableCell className="text-right">
					{formatEur(catVerbleibend)}
				</TableCell>
				<TableCell>
					<Progress value={Math.min(catAuslastung, 100)} />
				</TableCell>
				<TableCell>
					<StatusBadge status={catStatus} />
				</TableCell>
			</TableRow>
			{items.map((k) => (
				<TableRow key={k.id}>
					<TableCell className="pl-6 text-muted-foreground">{k.name}</TableCell>
					<TableCell className="text-right">{formatEur(k.budget)}</TableCell>
					<TableCell className="text-right">
						{formatEur(k.ausgegeben)}
					</TableCell>
					<TableCell className="text-right">
						{formatEur(k.verbleibend)}
					</TableCell>
					<TableCell>
						<Progress value={Math.min(k.auslastung, 100)} />
					</TableCell>
					<TableCell>
						<StatusBadge status={k.status} />
					</TableCell>
				</TableRow>
			))}
		</>
	);
}
