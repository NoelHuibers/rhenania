"use client";

import { Download, Pencil, Plus, Receipt, Trash2, Upload } from "lucide-react";
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
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "~/components/ui/table";
import { formatEur } from "~/lib/cc-kasse-format";
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
import { EtaplanDialog } from "./EtaplanDialog";
import { KostenpunktDialog } from "./KostenpunktDialog";
import { ReimbursementDialog } from "./ReimbursementDialog";

type Props = {
	etaplan: Etaplan;
	kostenpunkte: KostenpunktWithPositions[];
	events: LinkableEvent[];
	isTreasury: boolean;
};

function downloadBase64(base64: string, fileName: string, mime: string) {
	const bytes = atob(base64);
	const arr = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
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
		if (!file) return;
		const base64 = await fileToBase64(file);
		startTransition(async () => {
			const res = await importEtaplanXlsx({ etaplanId: etaplan.id, base64 });
			if (res.success) {
				toast.success(
					`Import: ${res.created} neu, ${res.updated} aktualisiert, ${res.unchanged} unverändert`,
				);
				if (res.note) toast.message(res.note);
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
		if (!deleteId) return;
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
			<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
				<div className="flex items-center gap-2">
					<h2 className="font-semibold text-lg">{etaplan.name}</h2>
					<Badge variant={etaplan.status === "Aktiv" ? "default" : "secondary"}>
						{etaplan.status}
					</Badge>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => setEditEtaplanOpen(true)}
					>
						<Pencil className="mr-1 h-4 w-4" /> Etatplan
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={onExport}
						disabled={isPending}
					>
						<Download className="mr-1 h-4 w-4" /> Export
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => fileInputRef.current?.click()}
						disabled={isPending}
					>
						<Upload className="mr-1 h-4 w-4" /> Import
					</Button>
					<input
						ref={fileInputRef}
						type="file"
						accept=".xlsx"
						className="hidden"
						onChange={onImportFile}
					/>
					{isTreasury && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setBookingOpen(true)}
							disabled={kostenpunkte.length === 0}
						>
							<Receipt className="mr-1 h-4 w-4" /> Direktbuchung
						</Button>
					)}
					<Button size="sm" onClick={openNewKp}>
						<Plus className="mr-1 h-4 w-4" /> Kostenpunkt
					</Button>
				</div>
			</div>

			{grouped.length === 0 ? (
				<p className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
					Noch keine Kostenpunkte. Lege welche an oder importiere eine
					Excel-Datei.
				</p>
			) : (
				grouped.map((g) => {
					const catBudget = g.items.reduce((s, k) => s + k.budget, 0);
					const catIncome = g.items.reduce((s, k) => s + k.income, 0);
					return (
						<Card key={g.category}>
							<CardHeader className="flex flex-row items-center justify-between py-3">
								<CardTitle className="text-base">{g.category}</CardTitle>
								<span className="text-muted-foreground text-sm">
									Budget {formatEur(catBudget)}
									{catIncome > 0 && ` · Einnahmen ${formatEur(catIncome)}`}
								</span>
							</CardHeader>
							<CardContent>
								<Table>
									<TableBody>
										{g.items.map((kp) => (
											<TableRow key={kp.id} className="align-top">
												<TableCell>
													<div className="font-medium">{kp.name}</div>
													{kp.event && (
														<div className="text-muted-foreground text-xs">
															↳ {kp.event.title}
														</div>
													)}
													<div className="mt-1 space-y-0.5">
														{kp.positionen.map((p) => (
															<div
																key={p.id}
																className="flex justify-between gap-4 text-muted-foreground text-xs"
															>
																<span>{p.bemerkung ?? "—"}</span>
																<span className="whitespace-nowrap">
																	{formatEur(p.ausgaben)}
																	{p.einnahmen > 0 &&
																		` / +${formatEur(p.einnahmen)}`}
																</span>
															</div>
														))}
													</div>
												</TableCell>
												<TableCell className="text-right">
													<div className="font-medium">
														{formatEur(kp.budget)}
													</div>
													{kp.income > 0 && (
														<div className="text-muted-foreground text-xs">
															+{formatEur(kp.income)}
														</div>
													)}
												</TableCell>
												<TableCell className="w-[90px] text-right">
													<div className="flex justify-end gap-1">
														<Button
															variant="ghost"
															size="icon"
															onClick={() => openEditKp(kp)}
														>
															<Pencil className="h-4 w-4" />
														</Button>
														<Button
															variant="ghost"
															size="icon"
															onClick={() => setDeleteId(kp.id)}
														>
															<Trash2 className="h-4 w-4" />
														</Button>
													</div>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</CardContent>
						</Card>
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
				<ReimbursementDialog
					open={bookingOpen}
					onOpenChange={setBookingOpen}
					kostenpunkte={bookableOptions}
					mode="direct"
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
						<AlertDialogTitle>Kostenpunkt löschen?</AlertDialogTitle>
						<AlertDialogDescription>
							Der Kostenpunkt und seine Positionen werden gelöscht. Das ist nur
							möglich, wenn keine Erstattungen daran hängen.
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
