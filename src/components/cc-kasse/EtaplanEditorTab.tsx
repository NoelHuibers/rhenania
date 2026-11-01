"use client";

import { FileSpreadsheet, MoreHorizontal } from "lucide-react";
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
import { EmptyState } from "~/components/ui/empty-state";
import { SectionCard } from "~/components/ui/section-card";
import { formatEUR } from "~/lib/format";
import {
	exportEtaplanXlsx,
	importEtaplanXlsx,
} from "~/server/actions/cc-kasse/excel";
import type { Etaplan } from "~/server/modules/cc-kasse/actions";
import {
	deleteEinnahme,
	deleteKostenpunkt,
	type EinnahmeRow,
	type KostenpunktWithPositions,
	type LinkableEvent,
} from "~/server/modules/cc-kasse/actions";
import { type EditingEinnahme, EinnahmeDialog } from "./EinnahmeDialog";
import { EtaplanDialog } from "./EtaplanDialog";
import { EtaplanToolbar } from "./etaplan-editor/EtaplanToolbar";
import { downloadBase64, fileToBase64 } from "./etaplan-editor/file-transfer";
import { KostenpunktItem } from "./etaplan-editor/KostenpunktItem";
import { KostenpunktDialog } from "./KostenpunktDialog";
import { ReimbursementDialog } from "./ReimbursementDialog";

type Props = {
	etaplan: Etaplan;
	kostenpunkte: KostenpunktWithPositions[];
	einnahmen: EinnahmeRow[];
	events: LinkableEvent[];
	isTreasury: boolean;
};

export function EtaplanEditorTab({
	etaplan,
	kostenpunkte,
	einnahmen,
	events,
	isTreasury,
}: Props) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

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
			if (res.ok) {
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
			if (res.ok) {
				downloadBase64(
					res.data.base64,
					res.data.fileName,
					"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				);
			} else {
				toast.error(res.error);
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
			if (res.ok) {
				const { created, updated, unchanged, note, errors } = res.data;
				toast.success(
					`Import: ${created} neu, ${updated} aktualisiert, ${unchanged} unverändert`,
				);
				if (note) {
					toast.message(note);
				}
				if (errors.length) {
					toast.warning(`${errors.length} Zeilen übersprungen`);
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
			if (res.ok) {
				toast.success("Kostenpunkt gelöscht");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<div className="space-y-4">
			<EtaplanToolbar
				kostenpunkte={kostenpunkte}
				isPending={isPending}
				isTreasury={isTreasury}
				onEditEtaplan={() => setEditEtaplanOpen(true)}
				onExport={onExport}
				onImportFile={onImportFile}
				onBook={() => setBookingOpen(true)}
				onNewEinnahme={openNewEinnahme}
				onNewKp={openNewKp}
			/>

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
						<SectionCard
							key={g.category}
							title={g.category}
							aside={
								<div className="text-xs tabular-nums">
									<span className="font-semibold">{formatEUR(catBudget)}</span>
									{catIncome > 0 && (
										<span className="text-muted-foreground">
											{" "}
											· +{formatEUR(catIncome)}
										</span>
									)}
								</div>
							}
						>
							<ul className="divide-y">
								{g.items.map((kp) => (
									<KostenpunktItem
										key={kp.id}
										kp={kp}
										kpEinnahmen={einnahmenByKp.get(kp.id) ?? []}
										isTreasury={isTreasury}
										onEdit={openEditKp}
										onDelete={setDeleteId}
										onEditEinnahme={openEditEinnahme}
										onDeleteEinnahme={setDeleteEinnahmeId}
									/>
								))}
							</ul>
						</SectionCard>
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
