"use client";

import {
	CalendarDays,
	ChevronDown,
	Download,
	FileSpreadsheet,
	MoreHorizontal,
	MoreVertical,
	Pencil,
	PiggyBank,
	Plus,
	Receipt,
	Trash2,
	Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { formatEur } from "~/lib/cc-kasse-format";
import {
	deleteEinnahme,
	type EinnahmeRow,
} from "~/server/actions/cc-kasse/einnahmen";
import type { Etaplan } from "~/server/actions/cc-kasse/etaplans";
import {
	exportEtaplanXlsx,
	importEtaplanXlsx,
} from "~/server/actions/cc-kasse/excel";
import {
	deleteKostenpunkt,
	type KostenpunktWithPositions,
	type LinkableEvent,
} from "~/server/actions/cc-kasse/kostenpunkte";
import { type EditingEinnahme, EinnahmeDialog } from "./EinnahmeDialog";
import { EtaplanDialog } from "./EtaplanDialog";
import { EmptyState, formatDate } from "./KasseUi";
import { KostenpunktDialog } from "./KostenpunktDialog";
import { ReimbursementDialog } from "./ReimbursementDialog";

type Props = {
	etaplan: Etaplan;
	kostenpunkte: KostenpunktWithPositions[];
	einnahmen: EinnahmeRow[];
	events: LinkableEvent[];
	isTreasury: boolean;
};

function downloadBase64(base64: string, fileName: string, mime: string) {
	const bytes = atob(base64);
	const arr = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		arr[i] = bytes.charCodeAt(i);
	}
	const blob = new Blob([arr], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	a.click();
	URL.revokeObjectURL(url);
}

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			resolve(result.split(",")[1] ?? "");
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

export function EtaplanEditorTab({
	etaplan,
	kostenpunkte,
	einnahmen,
	events,
	isTreasury,
}: Props) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [editEtaplanOpen, setEditEtaplanOpen] = useState(false);
	const [kpDialogOpen, setKpDialogOpen] = useState(false);
	const [editingKp, setEditingKp] = useState<KostenpunktWithPositions | null>(
		null,
	);
	const [bookingOpen, setBookingOpen] = useState(false);
	const [einnahmeOpen, setEinnahmeOpen] = useState(false);
	const [editingEinnahme, setEditingEinnahme] =
		useState<EditingEinnahme | null>(null);
	const [deleteEinnahmeId, setDeleteEinnahmeId] = useState<string | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);

	const categories = Array.from(
		new Map(
			kostenpunkte.map((k) => [
				k.category,
				{ category: k.category, categoryOrder: k.categoryOrder },
			]),
		).values(),
	).sort((a, b) => a.categoryOrder - b.categoryOrder);

	const grouped = categories.map((c) => ({
		...c,
		items: kostenpunkte.filter((k) => k.category === c.category),
	}));

	// Booked income grouped by Kostenpunkt — shown inline under each point so
	// e.g. Stiftungsfest is one thing: plan positions plus what actually came in.
	const einnahmenByKp = new Map<string, EinnahmeRow[]>();
	for (const e of einnahmen) {
		const list = einnahmenByKp.get(e.kostenpunktId) ?? [];
		list.push(e);
		einnahmenByKp.set(e.kostenpunktId, list);
	}

	const openNewEinnahme = () => {
		setEditingEinnahme(null);
		setEinnahmeOpen(true);
	};
	const openEditEinnahme = (e: EinnahmeRow) => {
		setEditingEinnahme({
			id: e.id,
			kostenpunktId: e.kostenpunktId,
			kostenpunktName: e.kostenpunkt?.name ?? "",
			kostenpunktCategory: e.kostenpunkt?.category ?? "",
			amount: e.amount,
			description: e.description,
			incomeDate: e.incomeDate,
		});
		setEinnahmeOpen(true);
	};
	const confirmDeleteEinnahme = () => {
		if (!deleteEinnahmeId) {
			return;
		}
		const id = deleteEinnahmeId;
		setDeleteEinnahmeId(null);
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

	const bookableOptions = kostenpunkte.map((k) => ({
		id: k.id,
		name: k.name,
		category: k.category,
	}));

	const openNewKp = () => {
		setEditingKp(null);
		setKpDialogOpen(true);
	};
	const openEditKp = (kp: KostenpunktWithPositions) => {
		setEditingKp(kp);
		setKpDialogOpen(true);
	};

	const onExport = () => {
		startTransition(async () => {
			const res = await exportEtaplanXlsx(etaplan.id);
			if (res.success && res.base64 && res.fileName) {
				downloadBase64(
					res.base64,
					res.fileName,
					"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				);
			} else {
				toast.error(res.error ?? "Export fehlgeschlagen");
			}
		});
	};

	const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) {
			return;
		}
		const base64 = await fileToBase64(file);
		startTransition(async () => {
			const res = await importEtaplanXlsx({ etaplanId: etaplan.id, base64 });
			if (res.success) {
				toast.success(
					`Import: ${res.created} neu, ${res.updated} aktualisiert, ${res.unchanged} unverändert`,
				);
				if (res.note) {
					toast.message(res.note);
				}
				if (res.errors.length) {
					toast.warning(`${res.errors.length} Zeilen übersprungen`);
				}
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	const confirmDelete = () => {
		if (!deleteId) {
			return;
		}
		const id = deleteId;
		setDeleteId(null);
		startTransition(async () => {
			const res = await deleteKostenpunkt(id);
			if (res.success) {
				toast.success("Kostenpunkt gelöscht");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 items-center gap-2">
					<div className="min-w-0">
						<h2 className="font-semibold text-base">Kostenpunkte</h2>
						<p className="text-muted-foreground text-xs tabular-nums">
							{kostenpunkte.length} Posten · Budget{" "}
							{formatEur(kostenpunkte.reduce((s, k) => s + k.budget, 0))}
						</p>
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon-sm"
								className="ml-auto sm:ml-0"
								disabled={isPending}
								aria-label="Etatplan-Aktionen"
							>
								<MoreHorizontal />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => setEditEtaplanOpen(true)}>
								<Pencil /> Etatplan bearbeiten
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={onExport}>
								<Download /> Als Excel exportieren
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
								<Upload /> Excel importieren
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
					<input
						ref={fileInputRef}
						type="file"
						accept=".xlsx"
						className="hidden"
						onChange={onImportFile}
					/>
				</div>
				<div className="grid grid-cols-2 gap-2 sm:flex">
					{isTreasury && (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button variant="outline" disabled={kostenpunkte.length === 0}>
									<Receipt /> Buchen
									<ChevronDown className="opacity-60" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-56">
								<DropdownMenuItem onClick={() => setBookingOpen(true)}>
									<Receipt />
									<div>
										<div>Ausgabe</div>
										<div className="text-muted-foreground text-xs">
											Direkt bezahlte Rechnung
										</div>
									</div>
								</DropdownMenuItem>
								<DropdownMenuItem onClick={openNewEinnahme}>
									<PiggyBank />
									<div>
										<div>Einnahme</div>
										<div className="text-muted-foreground text-xs">
											z. B. Bargeld vom Fest
										</div>
									</div>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
					<Button
						onClick={openNewKp}
						className={isTreasury ? undefined : "col-span-2"}
					>
						<Plus /> Kostenpunkt
					</Button>
				</div>
			</div>

			{grouped.length === 0 ? (
				<EmptyState
					icon={<FileSpreadsheet className="size-5" />}
					title="Noch keine Kostenpunkte"
				>
					Lege den ersten Kostenpunkt an oder importiere eine Excel-Datei über
					das <MoreHorizontal className="inline size-4" />
					-Menü.
				</EmptyState>
			) : (
				grouped.map((g) => {
					const catBudget = g.items.reduce((s, k) => s + k.budget, 0);
					const catIncome = g.items.reduce((s, k) => s + k.income, 0);
					return (
						<section
							key={g.category}
							className="overflow-hidden rounded-xl border bg-card shadow-xs"
						>
							<div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2.5">
								<h3 className="min-w-0 truncate font-semibold text-sm">
									{g.category}
								</h3>
								<div className="shrink-0 text-right text-xs tabular-nums">
									<span className="font-semibold">{formatEur(catBudget)}</span>
									{catIncome > 0 && (
										<span className="text-muted-foreground">
											{" "}
											· +{formatEur(catIncome)}
										</span>
									)}
								</div>
							</div>
							<ul className="divide-y">
								{g.items.map((kp) => {
									const kpEinnahmen = einnahmenByKp.get(kp.id) ?? [];
									const erhalten = kpEinnahmen.reduce(
										(s, e) => s + e.amount,
										0,
									);
									return (
										<li key={kp.id} className="px-4 py-3">
											<div className="flex items-start justify-between gap-3">
												<div className="min-w-0">
													<div className="font-medium text-sm">{kp.name}</div>
													{kp.event && (
														<div className="flex items-center gap-1 text-muted-foreground text-xs">
															<CalendarDays className="size-3" />
															<span className="truncate">{kp.event.title}</span>
														</div>
													)}
												</div>
												<div className="flex shrink-0 items-start gap-1">
													<div className="text-right">
														<div className="font-semibold text-sm tabular-nums">
															{formatEur(kp.budget)}
														</div>
														{kp.income > 0 && (
															<div className="text-muted-foreground text-xs tabular-nums">
																+{formatEur(kp.income)} geplant
															</div>
														)}
														{erhalten > 0 && (
															<div className="text-emerald-600 text-xs tabular-nums dark:text-emerald-400">
																+{formatEur(erhalten)} erhalten
															</div>
														)}
													</div>
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																variant="ghost"
																size="icon-sm"
																className="-mt-1 -mr-2"
																aria-label={`Aktionen für ${kp.name}`}
															>
																<MoreVertical />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuItem onClick={() => openEditKp(kp)}>
																<Pencil /> Bearbeiten
															</DropdownMenuItem>
															<DropdownMenuItem
																variant="destructive"
																onClick={() => setDeleteId(kp.id)}
															>
																<Trash2 /> Löschen
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</div>
											</div>

											{kp.positionen.length > 0 && (
												<ul className="mt-2 space-y-0.5 border-l-2 pl-3">
													{kp.positionen.map((p) => (
														<li
															key={p.id}
															className="flex justify-between gap-3 text-muted-foreground text-xs"
														>
															<span className="min-w-0 truncate">
																{p.bemerkung ?? "—"}
															</span>
															<span className="shrink-0 whitespace-nowrap tabular-nums">
																{formatEur(p.ausgaben)}
																{p.einnahmen > 0 &&
																	` / +${formatEur(p.einnahmen)}`}
															</span>
														</li>
													))}
												</ul>
											)}

											{kpEinnahmen.length > 0 && (
												<ul className="mt-2 space-y-0.5 border-emerald-500/50 border-l-2 pl-3">
													{kpEinnahmen.map((e) => (
														<li
															key={e.id}
															className="flex items-center justify-between gap-3 text-xs"
														>
															<span className="min-w-0 truncate text-muted-foreground">
																{formatDate(e.incomeDate)} · {e.description}
															</span>
															<span className="flex shrink-0 items-center gap-0.5 whitespace-nowrap font-medium text-emerald-600 tabular-nums dark:text-emerald-400">
																+{formatEur(e.amount)}
																{isTreasury && (
																	<DropdownMenu>
																		<DropdownMenuTrigger asChild>
																			<Button
																				variant="ghost"
																				size="icon-xs"
																				aria-label="Einnahme-Aktionen"
																			>
																				<MoreVertical />
																			</Button>
																		</DropdownMenuTrigger>
																		<DropdownMenuContent align="end">
																			<DropdownMenuItem
																				onClick={() => openEditEinnahme(e)}
																			>
																				<Pencil /> Bearbeiten
																			</DropdownMenuItem>
																			<DropdownMenuItem
																				variant="destructive"
																				onClick={() =>
																					setDeleteEinnahmeId(e.id)
																				}
																			>
																				<Trash2 /> Löschen
																			</DropdownMenuItem>
																		</DropdownMenuContent>
																	</DropdownMenu>
																)}
															</span>
														</li>
													))}
												</ul>
											)}
										</li>
									);
								})}
							</ul>
						</section>
					);
				})
			)}

			<EtaplanDialog
				open={editEtaplanOpen}
				onOpenChange={setEditEtaplanOpen}
				etaplan={etaplan}
				onSaved={() => router.refresh()}
			/>
			<KostenpunktDialog
				open={kpDialogOpen}
				onOpenChange={setKpDialogOpen}
				etaplanId={etaplan.id}
				kostenpunkt={editingKp}
				categories={categories}
				events={events}
				onSaved={() => router.refresh()}
			/>
			{isTreasury && (
				<>
					<ReimbursementDialog
						open={bookingOpen}
						onOpenChange={setBookingOpen}
						kostenpunkte={bookableOptions}
						mode="direct"
						onSaved={() => router.refresh()}
					/>
					<EinnahmeDialog
						open={einnahmeOpen}
						onOpenChange={setEinnahmeOpen}
						kostenpunkte={bookableOptions}
						editing={editingEinnahme}
						onSaved={() => router.refresh()}
					/>
				</>
			)}

			<AlertDialog
				open={deleteEinnahmeId !== null}
				onOpenChange={(o) => {
					if (!o) {
						setDeleteEinnahmeId(null);
					}
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
						<AlertDialogCancel>Abbrechen</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDeleteEinnahme}>
							Löschen
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={deleteId !== null}
				onOpenChange={(o) => {
					if (!o) {
						setDeleteId(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Kostenpunkt löschen?</AlertDialogTitle>
						<AlertDialogDescription>
							Der Kostenpunkt und seine Positionen werden gelöscht. Das ist nur
							möglich, wenn keine Erstattungen oder Einnahmen daran hängen.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Abbrechen</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDelete}>
							Löschen
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
