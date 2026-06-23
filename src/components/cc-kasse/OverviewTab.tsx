"use client";

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
import type {
	BudgetStatus,
	EtaplanOverview,
} from "~/server/actions/cc-kasse/overview";

const STATUS_META: Record<BudgetStatus, { label: string; cls: string }> = {
	"on-track": { label: "Im Plan", cls: "bg-green-100 text-green-900" },
	warning: { label: "Achtung", cls: "bg-amber-100 text-amber-900" },
	"over-budget": { label: "Über Budget", cls: "bg-red-100 text-red-900" },
};

function StatusBadge({ status }: { status: BudgetStatus }) {
	const m = STATUS_META[status];
	return (
		<Badge variant="secondary" className={`${m.cls} hover:${m.cls}`}>
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
					title="Budget (Ausgaben)"
					value={formatEur(total.budget)}
				/>
				<SummaryCard
					title="Ausgegeben"
					value={formatEur(total.ausgegeben)}
					sub={`${total.auslastung}% ausgelastet`}
					badge={<StatusBadge status={total.status} />}
				/>
				<SummaryCard
					title="Genehmigt (offen)"
					value={formatEur(total.genehmigt)}
				/>
				<SummaryCard title="Verbleibend" value={formatEur(total.verbleibend)} />
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Plan-Saldo</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
					<span>
						Geplante Ausgaben:{" "}
						<span className="font-semibold">{formatEur(total.budget)}</span>
					</span>
					<span>
						Geplante Einnahmen:{" "}
						<span className="font-semibold">
							{formatEur(overview.geplanteEinnahmen)}
						</span>
					</span>
					<span>
						Zuschuss AHV (geplant):{" "}
						<span className="font-semibold">
							{formatEur(overview.geplanterZuschuss)}
						</span>
					</span>
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
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Kostenpunkt</TableHead>
								<TableHead className="text-right">Budget</TableHead>
								<TableHead className="text-right">Ausgegeben</TableHead>
								<TableHead className="hidden text-right sm:table-cell">
									Verbleibend
								</TableHead>
								<TableHead className="hidden w-[160px] sm:table-cell">
									Auslastung
								</TableHead>
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
				</CardContent>
			</Card>
		</div>
	);
}

function SummaryCard({
	title,
	value,
	sub,
	badge,
}: {
	title: string;
	value: string;
	sub?: string;
	badge?: React.ReactNode;
}) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<CardTitle className="flex items-center justify-between font-medium text-muted-foreground text-sm">
					{title}
					{badge}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="font-bold text-2xl">{value}</div>
				{sub && <p className="text-muted-foreground text-xs">{sub}</p>}
			</CardContent>
		</Card>
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
				<TableCell className="hidden text-right sm:table-cell">
					{formatEur(catVerbleibend)}
				</TableCell>
				<TableCell className="hidden sm:table-cell">
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
					<TableCell className="hidden text-right sm:table-cell">
						{formatEur(k.verbleibend)}
					</TableCell>
					<TableCell className="hidden sm:table-cell">
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
