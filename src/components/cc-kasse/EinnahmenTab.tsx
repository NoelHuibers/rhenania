"use client";

import {
	CheckCircle2,
	Pencil,
	PiggyBank,
	Plus,
	Target,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
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
import type { EtaplanOverview } from "~/server/actions/cc-kasse/overview";
import { type EditingEinnahme, EinnahmeDialog } from "./EinnahmeDialog";
import type { KostenpunktOption } from "./ReimbursementDialog";

type Props = {
	overview: EtaplanOverview | null;
	einnahmen: EinnahmeRow[];
	isTreasury: boolean;
	kostenpunktOptions: KostenpunktOption[];
};

export function EinnahmenTab({
	overview,
	einnahmen,
	isTreasury,
	kostenpunktOptions,
}: Props) {
	if (!overview || overview.kostenpunkte.length === 0) {
		return (
			<p className="py-8 text-center text-muted-foreground text-sm">
				Noch keine Kostenpunkte im Etatplan.
			</p>
		);
	}

	const geplant = overview.geplanteEinnahmen;
	const erhalten = overview.total.istEinnahmen;
	const offen = geplant - erhalten;
	const pct =
		geplant > 0
			? Math.round((erhalten / geplant) * 100)
			: erhalten > 0
				? 100
				: 0;

	// Only Kostenpunkte where income is planned or has actually come in.
	const rows = overview.kostenpunkte.filter(
		(k) => k.income > 0 || k.istEinnahmen > 0,
	);

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
				<SummaryCard
					icon={<Target className="h-5 w-5" />}
					accent="bg-primary/10 text-primary"
					title="Geplante Einnahmen"
					value={formatEur(geplant)}
				/>
				<SummaryCard
					icon={<PiggyBank className="h-5 w-5" />}
					accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
					title="Erhalten"
					value={formatEur(erhalten)}
					sub={geplant > 0 ? `${pct}% des Plans` : undefined}
				/>
				<SummaryCard
					icon={<CheckCircle2 className="h-5 w-5" />}
					accent={
						offen <= 0
							? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
							: "bg-amber-500/10 text-amber-600 dark:text-amber-400"
					}
					title={offen <= 0 ? "Über Plan" : "Noch offen"}
					value={formatEur(Math.abs(offen))}
					valueClass={
						offen <= 0 ? "text-emerald-600 dark:text-emerald-400" : ""
					}
				/>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Geplant vs. Erhalten je Kostenpunkt
					</CardTitle>
				</CardHeader>
				<CardContent>
					{rows.length === 0 ? (
						<p className="py-4 text-center text-muted-foreground text-sm">
							Keine Kostenpunkte mit geplanten oder erhaltenen Einnahmen.
						</p>
					) : (
						<>
							{/* Mobile: stacked cards */}
							<div className="space-y-2 sm:hidden">
								{rows.map((k) => (
									<div key={k.id} className="rounded-lg border p-3">
										<div className="flex items-center justify-between gap-2">
											<div className="min-w-0">
												<div className="truncate font-medium text-sm">
													{k.name}
												</div>
												<div className="truncate text-muted-foreground text-xs">
													{k.category}
												</div>
											</div>
											<IncomePct income={k.income} ist={k.istEinnahmen} />
										</div>
										<div className="mt-2 grid grid-cols-3 gap-2 text-xs">
											<MobileAmount label="Geplant" value={k.income} />
											<MobileAmount
												label="Erhalten"
												value={k.istEinnahmen}
												positive={k.istEinnahmen > 0}
											/>
											<MobileAmount
												label="Offen"
												value={Math.max(0, k.income - k.istEinnahmen)}
											/>
										</div>
										<IncomeProgress
											className="mt-2"
											income={k.income}
											ist={k.istEinnahmen}
										/>
									</div>
								))}
							</div>

							{/* Desktop: table */}
							<div className="hidden sm:block">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Kostenpunkt</TableHead>
											<TableHead className="text-right">Geplant</TableHead>
											<TableHead className="text-right">Erhalten</TableHead>
											<TableHead className="text-right">Offen</TableHead>
											<TableHead className="w-[160px]">Fortschritt</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{rows.map((k) => (
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
												<TableCell className="text-right">
													{formatEur(Math.max(0, k.income - k.istEinnahmen))}
												</TableCell>
												<TableCell>
													<div className="flex items-center gap-2">
														<IncomeProgress
															className="flex-1"
															income={k.income}
															ist={k.istEinnahmen}
														/>
														<IncomePct income={k.income} ist={k.istEinnahmen} />
													</div>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
									<TableFooter>
										<TableRow>
											<TableCell className="font-semibold">Gesamt</TableCell>
											<TableCell className="text-right font-bold">
												{formatEur(geplant)}
											</TableCell>
											<TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
												{formatEur(erhalten)}
											</TableCell>
											<TableCell className="text-right font-bold">
												{formatEur(Math.max(0, offen))}
											</TableCell>
											<TableCell />
										</TableRow>
									</TableFooter>
								</Table>
							</div>
							<p className="mt-3 text-muted-foreground text-xs">
								Erhalten = gebuchte Einnahmen plus bezahlte Semesterbeiträge des
								verknüpften Kostenpunkts.
							</p>
						</>
					)}
				</CardContent>
			</Card>

			<EinnahmenCard
				einnahmen={einnahmen}
				isTreasury={isTreasury}
				kostenpunktOptions={kostenpunktOptions}
			/>
		</div>
	);
}

function IncomeProgress({
	income,
	ist,
	className,
}: {
	income: number;
	ist: number;
	className?: string;
}) {
	const pct = income > 0 ? (ist / income) * 100 : ist > 0 ? 100 : 0;
	return <Progress className={className} value={Math.min(pct, 100)} />;
}

function IncomePct({ income, ist }: { income: number; ist: number }) {
	const pct = income > 0 ? Math.round((ist / income) * 100) : ist > 0 ? 100 : 0;
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
	valueClass,
}: {
	icon: React.ReactNode;
	accent: string;
	title: string;
	value: string;
	sub?: string;
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
				<p className="truncate text-muted-foreground text-xs">{title}</p>
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
	positive,
}: {
	label: string;
	value: number;
	positive?: boolean;
}) {
	return (
		<div className="min-w-0">
			<div className="truncate text-muted-foreground">{label}</div>
			<div
				className={cn(
					"font-medium tabular-nums",
					positive && "text-emerald-600 dark:text-emerald-400",
				)}
			>
				{formatEur(value)}
			</div>
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
