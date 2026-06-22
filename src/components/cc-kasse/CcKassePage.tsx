"use client";

import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Button } from "~/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type { Etaplan } from "~/server/actions/cc-kasse/etaplans";
import type { QueueReimbursement } from "~/server/actions/cc-kasse/kostenerstattungen";
import type {
	KostenpunktWithPositions,
	LinkableEvent,
} from "~/server/actions/cc-kasse/kostenpunkte";
import type { EtaplanOverview } from "~/server/actions/cc-kasse/overview";
import { EtaplanDialog } from "./EtaplanDialog";
import { EtaplanEditorTab } from "./EtaplanEditorTab";
import { OverviewTab } from "./OverviewTab";
import { ReimbursementQueueTab } from "./ReimbursementQueueTab";

type Props = {
	etaplans: Etaplan[];
	selectedEtaplan: Etaplan | null;
	kostenpunkte: KostenpunktWithPositions[];
	overview: EtaplanOverview | null;
	queue: QueueReimbursement[];
	events: LinkableEvent[];
	isTreasury: boolean;
};

export function CcKassePage({
	etaplans,
	selectedEtaplan,
	kostenpunkte,
	overview,
	queue,
	events,
	isTreasury,
}: Props) {
	const router = useRouter();
	const sp = useSearchParams();
	const tab = sp.get("tab") ?? "etaplan";
	const [createOpen, setCreateOpen] = useState(false);

	const navigate = (next: { tab?: string; etaplan?: string }) => {
		const params = new URLSearchParams(sp.toString());
		if (next.tab) params.set("tab", next.tab);
		if (next.etaplan) params.set("etaplan", next.etaplan);
		router.replace(`/cc-kasse?${params.toString()}`);
	};

	return (
		<div className="flex flex-col">
			<SiteHeader title="CC-Kasse" />
			<div className="space-y-4 p-4 md:p-6">
				<div className="flex flex-wrap items-center justify-between gap-2">
					{etaplans.length > 0 ? (
						<Select
							value={selectedEtaplan?.id ?? ""}
							onValueChange={(id) => navigate({ etaplan: id })}
						>
							<SelectTrigger className="w-[240px]">
								<SelectValue placeholder="Etatplan wählen" />
							</SelectTrigger>
							<SelectContent>
								{etaplans.map((e) => (
									<SelectItem key={e.id} value={e.id}>
										{e.name}
										{e.status === "Abgeschlossen" ? " (abgeschlossen)" : ""}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					) : (
						<span />
					)}
					<Button onClick={() => setCreateOpen(true)}>
						<Plus className="mr-2 h-4 w-4" /> Neuer Etatplan
					</Button>
				</div>

				{!selectedEtaplan ? (
					<p className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
						Noch kein Etatplan vorhanden. Erstelle den ersten Etatplan.
					</p>
				) : (
					<Tabs value={tab} onValueChange={(v) => navigate({ tab: v })}>
						<TabsList>
							<TabsTrigger value="etaplan">Etatplan</TabsTrigger>
							<TabsTrigger value="antraege">Anträge</TabsTrigger>
							<TabsTrigger value="uebersicht">Übersicht</TabsTrigger>
						</TabsList>
						<TabsContent value="etaplan" className="mt-4">
							<EtaplanEditorTab
								etaplan={selectedEtaplan}
								kostenpunkte={kostenpunkte}
								events={events}
								isTreasury={isTreasury}
							/>
						</TabsContent>
						<TabsContent value="antraege" className="mt-4">
							<ReimbursementQueueTab queue={queue} isTreasury={isTreasury} />
						</TabsContent>
						<TabsContent value="uebersicht" className="mt-4">
							<OverviewTab overview={overview} />
						</TabsContent>
					</Tabs>
				)}
			</div>

			<EtaplanDialog
				open={createOpen}
				onOpenChange={setCreateOpen}
				onSaved={(id) => {
					if (id) navigate({ etaplan: id });
					else router.refresh();
				}}
			/>
		</div>
	);
}
