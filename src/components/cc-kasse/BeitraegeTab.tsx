"use client";

import {
	BellRing,
	Check,
	Clock3,
	FileText,
	Mail,
	MoreHorizontal,
	MoreVertical,
	Plus,
	RefreshCw,
	Search,
	Trash2,
	Undo2,
	Users,
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
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Progress } from "~/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { formatEur } from "~/lib/cc-kasse-format";
import { downloadBase64, PDF_MIME } from "~/lib/file-download";
import type { Etaplan } from "~/server/actions/cc-kasse/etaplans";
import {
	type BeitragRun,
	type ChargeListItem,
	type ChargesForRun,
	deleteBeitragRun,
	downloadChargePdf,
	markChargeDeferred,
	markChargePaid,
	markChargeUnpaid,
	regenerateCharges,
	sendBeitragEmails,
	sendMahnungen,
} from "~/server/actions/members/semesterbeitrag";
import { BeitragRunDialog } from "./BeitragRunDialog";
import { EmptyState, FilterChips, formatDate } from "./KasseUi";

type KpOption = { id: string; name: string; category: string };
type ChargeFilter = "offen" | "Bezahlt" | "Gestundet" | "alle";

function chargeBadge(c: ChargeListItem) {
	if (c.status === "Bezahlt")
		return (
			<Badge
				variant="outline"
				className="border-emerald-200 bg-emerald-50 font-medium text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300"
			>
				Bezahlt
			</Badge>
		);
	if (c.status === "Gestundet")
		return (
			<Badge
				variant="outline"
				className="border-yellow-200 bg-yellow-50 font-medium text-yellow-700 dark:border-yellow-500/25 dark:bg-yellow-500/10 dark:text-yellow-300"
			>
				Gestundet
			</Badge>
		);
	if (c.status === "Gemahnt")
		return (
			<Badge
				variant="outline"
				className="border-red-200 bg-red-50 font-medium text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300"
			>
				Gemahnt
			</Badge>
		);
	if (c.ueberfaellig)
		return (
			<Badge
				variant="outline"
				className="border-amber-200 bg-amber-50 font-medium text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
			>
				Überfällig
			</Badge>
		);
	return <Badge variant="secondary">Offen</Badge>;
}

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
	const paid = charges.filter((c) => c.status === "Bezahlt").length;
	const totalPaid = charges
		.filter((c) => c.status === "Bezahlt")
		.reduce((s, c) => s + c.total, 0);
	const totalExpected = charges.reduce((s, c) => s + c.total, 0);

	const [filter, setFilter] = useState<ChargeFilter>("offen");
	const [query, setQuery] = useState("");
	const matchesFilter = (c: ChargeListItem, f: ChargeFilter) => {
		if (f === "alle") return true;
		if (f === "offen") return c.status === "Offen" || c.status === "Gemahnt";
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
		if (!run) return;
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
		if (!run) return;
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
		if (!run) return;
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
			if (res.success) downloadBase64(res.base64, res.fileName, PDF_MIME);
			else toast.error(res.error);
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
					<div className="rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="text-muted-foreground text-sm">Eingenommen</p>
								<p className="font-bold text-2xl tabular-nums tracking-tight sm:text-3xl">
									{formatEur(totalPaid)}
								</p>
								<p className="text-muted-foreground text-xs tabular-nums">
									von {formatEur(totalExpected)} · fällig{" "}
									{formatDate(run.dueDate)}
								</p>
							</div>
							<div className="text-right">
								<p className="font-semibold text-lg tabular-nums">
									{paid}/{charges.length}
								</p>
								<p className="text-muted-foreground text-xs">bezahlt</p>
							</div>
						</div>
						<Progress
							className="mt-4 h-2.5 [&>[data-slot=progress-indicator]]:bg-emerald-500"
							value={charges.length ? (paid / charges.length) * 100 : 0}
						/>
						<div className="mt-4 flex flex-wrap gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={sendEmails}
								disabled={isPending || charges.length === 0}
							>
								<Mail /> E-Mails senden
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={sendMahn}
								disabled={isPending || charges.length === 0}
							>
								<BellRing /> Mahnen
							</Button>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon-sm"
										disabled={isPending}
										aria-label="Weitere Aktionen"
									>
										<MoreHorizontal />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem
										onClick={() => runAction(() => regenerateCharges(run.id))}
									>
										<RefreshCw /> Mitglieder aktualisieren
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										variant="destructive"
										onClick={() => setDeleteOpen(true)}
									>
										<Trash2 /> Lauf löschen
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					</div>

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
							<FilterChips<ChargeFilter>
								value={filter}
								onChange={setFilter}
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
										<li
											key={c.id}
											className="flex items-center justify-between gap-3 px-4 py-3"
										>
											<div className="min-w-0">
												<div className="flex items-center gap-2">
													<span className="truncate font-medium text-sm">
														{c.memberName}
													</span>
													{chargeBadge(c)}
												</div>
												<div className="text-muted-foreground text-xs tabular-nums">
													{formatEur(c.total)}
													{c.mahnungAmount > 0 &&
														` (inkl. ${formatEur(c.mahnungAmount)} Mahngebühr)`}
													{!c.hasEmail && " · Brief nötig"}
													{c.emailSentAt && " · Email gesendet"}
												</div>
											</div>
											<div className="flex shrink-0 items-center gap-1">
												{c.status !== "Bezahlt" && (
													<Button
														variant="outline"
														size="sm"
														disabled={isPending}
														onClick={() =>
															runAction(() => markChargePaid(c.id))
														}
													>
														<Check />
														<span className="hidden sm:inline">Bezahlt</span>
													</Button>
												)}
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="icon-sm"
															disabled={isPending}
															aria-label={`Aktionen für ${c.memberName}`}
														>
															<MoreVertical />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														{c.status !== "Bezahlt" &&
															c.status !== "Gestundet" && (
																<DropdownMenuItem
																	onClick={() =>
																		runAction(() => markChargeDeferred(c.id))
																	}
																>
																	<Clock3 /> Stunden
																</DropdownMenuItem>
															)}
														{(c.status === "Bezahlt" ||
															c.status === "Gestundet") && (
															<DropdownMenuItem
																onClick={() =>
																	runAction(() => markChargeUnpaid(c.id))
																}
															>
																<Undo2 /> Zurücksetzen
															</DropdownMenuItem>
														)}
														<DropdownMenuItem
															onClick={() => dlPdf(c.id, c.mahnungAmount > 0)}
														>
															<FileText /> PDF herunterladen
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</div>
										</li>
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
						if (id) onNavigateRun(id);
						else router.refresh();
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
