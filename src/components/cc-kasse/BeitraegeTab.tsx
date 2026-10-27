"use client";

import { Plus, Search, Users } from "lucide-react";
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
import { ChipGroup } from "~/components/ui/chip-group";
import { EmptyState } from "~/components/ui/empty-state";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { downloadBase64, PDF_MIME } from "~/lib/file-download";
import type { Etaplan } from "~/server/actions/cc-kasse/etaplans";
import {
	type BeitragRun,
	type ChargeListItem,
	type ChargesForRun,
	deleteBeitragRun,
	downloadChargePdf,
	sendBeitragEmails,
	sendMahnungen,
} from "~/server/actions/members/semesterbeitrag";
import { BeitragRunDialog } from "./BeitragRunDialog";
import { ChargeRow } from "./beitraege/ChargeRow";
import { RunSummaryCard } from "./beitraege/RunSummaryCard";

type KpOption = { id: string; name: string; category: string };
type ChargeFilter = "offen" | "Bezahlt" | "Gestundet" | "alle";

export function BeitraegeTab({
	runs,
	selected,
	etaplan,
	kostenpunkte,
	onNavigateRun,
}: {
	runs: BeitragRun[];
	selected: ChargesForRun | null;
	etaplan: Etaplan | null;
	kostenpunkte: KpOption[];
	onNavigateRun: (runId: string) => void;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [createOpen, setCreateOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const run = selected?.run ?? null;
	const charges = selected?.charges ?? [];

	const [filter, setFilter] = useState<ChargeFilter>("offen");
	const [query, setQuery] = useState("");
	const matchesFilter = (c: ChargeListItem, f: ChargeFilter) => {
		if (f === "alle") {
			return true;
		}
		if (f === "offen") {
			return c.status === "Offen" || c.status === "Gemahnt";
		}
		return c.status === f;
	};
	const countBy = (f: ChargeFilter) =>
		charges.filter((c) => matchesFilter(c, f)).length;
	const q = query.trim().toLowerCase();
	const visible = charges.filter(
		(c) => matchesFilter(c, filter) && c.memberName.toLowerCase().includes(q),
	);

	const runAction = (
		action: () => Promise<{ success: boolean; error?: string }>,
	) =>
		startTransition(async () => {
			const res = await action();
			if (res.success) {
				toast.success("Aktualisiert");
				router.refresh();
			} else {
				toast.error(res.error ?? "Fehler");
			}
		});

	const sendEmails = () => {
		if (!run) {
			return;
		}
		startTransition(async () => {
			const res = await sendBeitragEmails(run.id);
			if (res.success) {
				toast.success(
					`${res.emailed} per Email, ${res.lettersPending} als Brief${
						res.failed ? `, ${res.failed} fehlgeschlagen` : ""
					}`,
				);
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	const sendMahn = () => {
		if (!run) {
			return;
		}
		startTransition(async () => {
			const res = await sendMahnungen(run.id);
			if (res.success) {
				toast.success(
					`${res.processed} gemahnt (${res.emailed} Email, ${res.lettersPending} Brief)`,
				);
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	const confirmDeleteRun = () => {
		if (!run) {
			return;
		}
		const id = run.id;
		setDeleteOpen(false);
		startTransition(async () => {
			const res = await deleteBeitragRun(id);
			if (res.success) {
				toast.success("Beitragslauf gelöscht");
				router.refresh();
			} else {
				toast.error(res.error ?? "Fehler");
			}
		});
	};

	const dlPdf = (chargeId: string, isMahnung: boolean) =>
		startTransition(async () => {
			const res = await downloadChargePdf(chargeId, { isMahnung });
			if (res.success) {
				downloadBase64(res.base64, res.fileName, PDF_MIME);
			} else {
				toast.error(res.error);
			}
		});

	return (
		<div className="space-y-4">
			<div className="flex gap-2">
				{runs.length > 0 ? (
					<Select value={run?.id ?? ""} onValueChange={onNavigateRun}>
						<SelectTrigger className="min-w-0 flex-1 sm:w-[260px] sm:flex-none">
							<SelectValue placeholder="Beitragslauf wählen" />
						</SelectTrigger>
						<SelectContent>
							{runs.map((r) => (
								<SelectItem key={r.id} value={r.id}>
									{r.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					<span className="flex-1" />
				)}
				<Button
					onClick={() => setCreateOpen(true)}
					disabled={!etaplan}
					className="shrink-0 sm:ml-auto"
				>
					<Plus />
					<span className="hidden sm:inline">Neuer Beitragslauf</span>
					<span className="sm:hidden">Neu</span>
				</Button>
			</div>

			{!etaplan && (
				<p className="text-muted-foreground text-sm">
					Lege zuerst einen Etatplan an, um Beiträge zu erstellen.
				</p>
			)}

			{runs.length === 0 && etaplan && (
				<EmptyState
					icon={<Users className="size-5" />}
					title="Noch kein Beitragslauf"
				>
					Ein Beitragslauf erstellt für alle beitragspflichtigen Mitglieder eine
					Rechnung, die du per E-Mail oder Brief verschicken kannst.
				</EmptyState>
			)}

			{run && (
				<>
					<RunSummaryCard
						run={run}
						charges={charges}
						isPending={isPending}
						sendEmails={sendEmails}
						sendMahn={sendMahn}
						runAction={runAction}
						onDelete={() => setDeleteOpen(true)}
					/>

					{charges.length === 0 ? (
						<EmptyState
							icon={<Users className="size-5" />}
							title="Keine Mitglieder"
						>
							Keine beitragspflichtigen Mitglieder (Fuchs / CB / IaCB).
						</EmptyState>
					) : (
						<div className="space-y-3">
							<div className="relative">
								<Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="Mitglied suchen"
									className="pl-9"
								/>
							</div>
							<ChipGroup<ChargeFilter>
								aria-label="Beiträge filtern"
								bleed
								value={filter}
								onValueChange={setFilter}
								options={[
									{ value: "offen", label: "Offen", count: countBy("offen") },
									{
										value: "Bezahlt",
										label: "Bezahlt",
										count: countBy("Bezahlt"),
									},
									{
										value: "Gestundet",
										label: "Gestundet",
										count: countBy("Gestundet"),
									},
									{ value: "alle", label: "Alle", count: charges.length },
								]}
							/>

							{visible.length === 0 ? (
								<p className="py-6 text-center text-muted-foreground text-sm">
									Keine Treffer.
								</p>
							) : (
								<ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
									{visible.map((c) => (
										<ChargeRow
											key={c.id}
											c={c}
											isPending={isPending}
											runAction={runAction}
											dlPdf={dlPdf}
										/>
									))}
								</ul>
							)}
						</div>
					)}
				</>
			)}

			{etaplan && (
				<BeitragRunDialog
					open={createOpen}
					onOpenChange={setCreateOpen}
					etaplan={etaplan}
					kostenpunkte={kostenpunkte}
					onSaved={(id) => {
						if (id) {
							onNavigateRun(id);
						} else {
							router.refresh();
						}
					}}
				/>
			)}

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Beitragslauf löschen?</AlertDialogTitle>
						<AlertDialogDescription>
							„{run?.name}“ und alle zugehörigen offenen Beiträge werden
							gelöscht. Das ist nur möglich, solange noch kein Beitrag bezahlt
							wurde.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Abbrechen</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDeleteRun}>
							Löschen
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
