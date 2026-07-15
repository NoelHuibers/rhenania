"use client";

import {
	Clock,
	Pencil,
	PiggyBank,
	Plus,
	Trash2,
	TrendingDown,
	Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
import {
	deleteEinnahme,
	type EinnahmeRow,
} from "~/server/actions/cc-kasse/einnahmen";
import type {
	BudgetStatus,
	EtaplanOverview,
} from "~/server/actions/cc-kasse/overview";
import { type EditingEinnahme, EinnahmeDialog } from "./EinnahmeDialog";
import type { KostenpunktOption } from "./ReimbursementDialog";

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
	einnahmen,
	isTreasury,
	kostenpunktOptions,
}: {
	overview: EtaplanOverview | null;
	einnahmen: EinnahmeRow[];
	isTreasury: boolean;
	kostenpunktOptions: KostenpunktOption[];
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

			<EinnahmenCard
				einnahmen={einnahmen}
				isTreasury={isTreasury}
				kostenpunktOptions={kostenpunktOptions}
			/>

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
		</div>
	);
}

function EinnahmenCard({
	einnahmen,
	isTreasury,
	kostenpunktOptions,
}: {
	einnahmen: EinnahmeRow[];
	isTreasury: boolean;
	kostenpunktOptions: KostenpunktOption[];
}) {
	const router = useRouter();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<EditingEinnahme | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	const total = einnahmen.reduce((s, e) => s + e.amount, 0);

	const openNew = () => {
		setEditing(null);
		setDialogOpen(true);
	};
	const openEdit = (e: EinnahmeRow) => {
		setEditing({
			id: e.id,
			kostenpunktId: e.kostenpunktId,
			kostenpunktName: e.kostenpunkt?.name ?? "",
			kostenpunktCategory: e.kostenpunkt?.category ?? "",
			amount: e.amount,
			description: e.description,
			incomeDate: e.incomeDate,
		});
		setDialogOpen(true);
	};
	const confirmDelete = () => {
		if (!deleteId) return;
		const id = deleteId;
		setDeleteId(null);
		startTransition(async () => {
			const res = await deleteEinnahme(id);
			if (res.success) {
				toast.success("Einnahme gelöscht");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<Card>
			<CardHeader className="flex flex-col gap-1 pb-2 sm:flex-row sm:items-center sm:justify-between">
				<CardTitle className="text-base">Gebuchte Einnahmen</CardTitle>
				<div className="flex items-center gap-3">
					{einnahmen.length > 0 && (
						<span className="text-muted-foreground text-sm">
							Summe{" "}
							<span className="font-semibold text-foreground">
								{formatEur(total)}
							</span>
						</span>
					)}
					{isTreasury && (
						<Button variant="outline" size="sm" onClick={openNew}>
							<Plus className="mr-1 h-4 w-4" /> Einnahme buchen
						</Button>
					)}
				</div>
			</CardHeader>
			<CardContent>
				{einnahmen.length === 0 ? (
					<p className="py-4 text-center text-muted-foreground text-sm">
						Noch keine Einnahmen gebucht (z.B. Barkasse einer Veranstaltung).
					</p>
				) : (
					<>
						{/* Mobile: stacked cards */}
						<div className="space-y-2 sm:hidden">
							{einnahmen.map((e) => (
								<div key={e.id} className="rounded-lg border p-3">
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<div className="truncate font-medium text-sm">
												{e.kostenpunkt?.name ?? "—"}
											</div>
											<div className="truncate text-muted-foreground text-xs">
												{e.description}
											</div>
											<div className="text-muted-foreground text-xs">
												{new Date(e.incomeDate).toLocaleDateString("de-DE")}
											</div>
										</div>
										<div className="shrink-0 text-right">
											<div className="font-medium tabular-nums">
												+{formatEur(e.amount)}
											</div>
											{isTreasury && (
												<div className="mt-1 flex justify-end gap-1">
													<Button
														variant="ghost"
														size="icon"
														onClick={() => openEdit(e)}
													>
														<Pencil className="h-4 w-4" />
													</Button>
													<Button
														variant="ghost"
														size="icon"
														onClick={() => setDeleteId(e.id)}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</div>
											)}
										</div>
									</div>
								</div>
							))}
						</div>

						{/* Desktop: table */}
						<div className="hidden sm:block">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Datum</TableHead>
										<TableHead>Kostenpunkt</TableHead>
										<TableHead>Beschreibung</TableHead>
										<TableHead className="text-right">Betrag</TableHead>
										{isTreasury && <TableHead className="w-[90px]" />}
									</TableRow>
								</TableHeader>
								<TableBody>
									{einnahmen.map((e) => (
										<TableRow key={e.id}>
											<TableCell className="whitespace-nowrap">
												{new Date(e.incomeDate).toLocaleDateString("de-DE")}
											</TableCell>
											<TableCell>
												<div className="font-medium">
													{e.kostenpunkt?.name ?? "—"}
												</div>
												<div className="text-muted-foreground text-xs">
													{e.kostenpunkt?.category ?? ""}
												</div>
											</TableCell>
											<TableCell className="text-muted-foreground">
												{e.description}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												+{formatEur(e.amount)}
											</TableCell>
											{isTreasury && (
												<TableCell>
													<div className="flex justify-end gap-1">
														<Button
															variant="ghost"
															size="icon"
															onClick={() => openEdit(e)}
														>
															<Pencil className="h-4 w-4" />
														</Button>
														<Button
															variant="ghost"
															size="icon"
															onClick={() => setDeleteId(e.id)}
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</div>
												</TableCell>
											)}
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</>
				)}
			</CardContent>

			{isTreasury && (
				<EinnahmeDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					kostenpunkte={kostenpunktOptions}
					editing={editing}
					onSaved={() => router.refresh()}
				/>
			)}

			<AlertDialog
				open={deleteId !== null}
				onOpenChange={(o) => {
					if (!o) setDeleteId(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Einnahme löschen?</AlertDialogTitle>
						<AlertDialogDescription>
							Die gebuchte Einnahme wird entfernt und aus den Ist-Einnahmen
							herausgerechnet.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isPending}>
							Abbrechen
						</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDelete} disabled={isPending}>
							Löschen
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
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
