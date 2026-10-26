"use client";

import {
	Check,
	ChevronsUpDown,
	Inbox,
	Landmark,
	LayoutDashboard,
	ListTree,
	Plus,
	Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import type { EinnahmeRow } from "~/server/actions/cc-kasse/einnahmen";
import type { Etaplan } from "~/server/actions/cc-kasse/etaplans";
import type { QueueReimbursement } from "~/server/actions/cc-kasse/kostenerstattungen";
import type {
	KostenpunktWithPositions,
	LinkableEvent,
} from "~/server/actions/cc-kasse/kostenpunkte";
import type { EtaplanOverview } from "~/server/actions/cc-kasse/overview";
import type {
	BeitragRun,
	ChargesForRun,
} from "~/server/actions/members/semesterbeitrag";
import { BeitraegeTab } from "./BeitraegeTab";
import { EtaplanDialog } from "./EtaplanDialog";
import { EtaplanEditorTab } from "./EtaplanEditorTab";
import { EmptyState } from "./KasseUi";
import { OverviewTab } from "./OverviewTab";
import { ReimbursementQueueTab } from "./ReimbursementQueueTab";

type Props = {
	etaplans: Etaplan[];
	selectedEtaplan: Etaplan | null;
	kostenpunkte: KostenpunktWithPositions[];
	overview: EtaplanOverview | null;
	queue: QueueReimbursement[];
	einnahmen: EinnahmeRow[];
	events: LinkableEvent[];
	isTreasury: boolean;
	beitragRuns: BeitragRun[];
	selectedBeitrag: ChargesForRun | null;
};

export function CcKassePage({
	etaplans,
	selectedEtaplan,
	kostenpunkte,
	overview,
	queue,
	einnahmen,
	events,
	isTreasury,
	beitragRuns,
	selectedBeitrag,
}: Props) {
	const router = useRouter();
	const sp = useSearchParams();
	const tab = sp.get("tab") ?? "uebersicht";
	const [createOpen, setCreateOpen] = useState(false);

	const kostenpunktOptions = kostenpunkte.map((k) => ({
		id: k.id,
		name: k.name,
		category: k.category,
	}));

	const navigate = (next: { tab?: string; etaplan?: string; run?: string }) => {
		const params = new URLSearchParams(sp.toString());
		if (next.tab) {
			params.set("tab", next.tab);
		}
		if (next.etaplan) {
			params.set("etaplan", next.etaplan);
		}
		if (next.run) {
			params.set("run", next.run);
		}
		router.replace(`/cc-kasse?${params.toString()}`);
	};

	const openCount = queue.filter(
		(r) => r.status === "Eingereicht" || r.status === "Genehmigt",
	).length;

	return (
		<div className="flex flex-col">
			<SiteHeader title="CC-Kasse" />
			<div className="space-y-4 p-4 md:p-6">
				{etaplans.length > 0 ? (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="group -mx-2 flex max-w-full items-center gap-2 rounded-lg px-2 py-1 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
							>
								<div className="min-w-0">
									<div className="text-muted-foreground text-xs">Etatplan</div>
									<div className="truncate font-semibold text-lg leading-tight">
										{selectedEtaplan?.name ?? "Etatplan wählen"}
									</div>
								</div>
								{selectedEtaplan && (
									<Badge
										variant={
											selectedEtaplan.status === "Aktiv"
												? "default"
												: "secondary"
										}
										className="self-end"
									>
										{selectedEtaplan.status}
									</Badge>
								)}
								<ChevronsUpDown className="size-4 shrink-0 self-end text-muted-foreground" />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-64">
							<DropdownMenuLabel>Etatplan wechseln</DropdownMenuLabel>
							{etaplans.map((e) => (
								<DropdownMenuItem
									key={e.id}
									onClick={() => navigate({ etaplan: e.id })}
								>
									<Check
										className={cn(
											e.id === selectedEtaplan?.id
												? "opacity-100"
												: "opacity-0",
										)}
									/>
									<span className="flex-1 truncate">{e.name}</span>
									{e.status === "Abgeschlossen" && (
										<span className="text-muted-foreground text-xs">
											abgeschlossen
										</span>
									)}
								</DropdownMenuItem>
							))}
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => setCreateOpen(true)}>
								<Plus /> Neuer Etatplan
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				) : null}

				{!selectedEtaplan ? (
					<EmptyState
						icon={<Landmark className="size-5" />}
						title="Noch kein Etatplan"
					>
						<p>
							Erstelle den ersten Etatplan, um Budget und Erstattungen zu
							verwalten.
						</p>
						<Button className="mt-4" onClick={() => setCreateOpen(true)}>
							<Plus /> Neuer Etatplan
						</Button>
					</EmptyState>
				) : (
					<Tabs value={tab} onValueChange={(v) => navigate({ tab: v })}>
						<div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-1 backdrop-blur supports-backdrop-filter:bg-background/80 md:static md:mx-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
							<TabsList className="h-10! w-full sm:w-fit">
								<TabsTrigger value="uebersicht" className="sm:px-3">
									<LayoutDashboard className="hidden sm:block" />
									Übersicht
								</TabsTrigger>
								<TabsTrigger value="antraege" className="sm:px-3">
									<Inbox className="hidden sm:block" />
									Anträge
									{openCount > 0 && (
										<span className="rounded-full bg-primary px-1.5 font-semibold text-[10px] text-primary-foreground tabular-nums leading-4">
											{openCount}
										</span>
									)}
								</TabsTrigger>
								<TabsTrigger value="etaplan" className="sm:px-3">
									<ListTree className="hidden sm:block" />
									Etatplan
								</TabsTrigger>
								{isTreasury && (
									<TabsTrigger value="beitraege" className="sm:px-3">
										<Users className="hidden sm:block" />
										Beiträge
									</TabsTrigger>
								)}
							</TabsList>
						</div>
						<TabsContent value="uebersicht" className="mt-2">
							<OverviewTab overview={overview} queue={queue} />
						</TabsContent>
						<TabsContent value="antraege" className="mt-2">
							<ReimbursementQueueTab
								queue={queue}
								isTreasury={isTreasury}
								kostenpunkte={kostenpunktOptions}
							/>
						</TabsContent>
						<TabsContent value="etaplan" className="mt-2">
							<EtaplanEditorTab
								etaplan={selectedEtaplan}
								kostenpunkte={kostenpunkte}
								einnahmen={einnahmen}
								events={events}
								isTreasury={isTreasury}
							/>
						</TabsContent>
						{isTreasury && (
							<TabsContent value="beitraege" className="mt-2">
								<BeitraegeTab
									runs={beitragRuns}
									selected={selectedBeitrag}
									etaplan={selectedEtaplan}
									kostenpunkte={kostenpunktOptions}
									onNavigateRun={(id) => navigate({ run: id })}
								/>
							</TabsContent>
						)}
					</Tabs>
				)}
			</div>

			<EtaplanDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onSaved={(id) => {
					if (id) {
						navigate({ etaplan: id });
					} else {
						router.refresh();
					}
				}}
			/>
		</div>
	);
}
