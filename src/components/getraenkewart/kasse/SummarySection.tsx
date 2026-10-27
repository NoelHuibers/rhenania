"use client";

import {
	Building2,
	CheckCircle,
	Euro,
	Package,
	Pencil,
	Receipt,
	Users,
	Warehouse,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "~/components/ui/card";
import { IconButton } from "~/components/ui/icon-button";
import { Input } from "~/components/ui/input";
import { StatusBadge } from "~/components/ui/status-badge";
import { parseDecimalInput } from "~/lib/decimal";
import { formatDate, formatDecimalInput, formatEUR } from "~/lib/format";
import { billStatusStyle } from "~/lib/status";
import { setPfandWert } from "~/server/actions/getraenkewart/kasse";
import type { Summary } from "./types";

/** Gesamtvermögen hero plus the supporting Kasse figures and editable Pfand. */
export function SummarySection({
	summary,
	pfandWert,
}: {
	summary: Summary;
	pfandWert: number;
}) {
	const router = useRouter();
	const [editingPfand, setEditingPfand] = useState(false);
	const [pfandInput, setPfandInput] = useState(formatDecimalInput(pfandWert));
	const [isPending, startTransition] = useTransition();

	function handleSavePfand() {
		const parsed = parseDecimalInput(pfandInput);
		if (Number.isNaN(parsed)) {
			return;
		}
		startTransition(async () => {
			const res = await setPfandWert(parsed);
			if (res.ok) {
				toast.success("Pfandwert gespeichert");
				setEditingPfand(false);
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	}

	const supportingCards: Array<{
		label: string;
		value: string;
		icon: typeof Euro;
		color: string;
		sub?: string;
		/** Shown after the value: what the amount is ("fällig"). */
		qualifier?: string;
		/** Gestundet amount, shown as its own line; omitted when undefined. */
		deferred?: number;
	}> = [
		{
			label: "Kassenstand",
			value: formatEUR(summary.kassenstand),
			icon: Euro,
			color: "text-info",
		},
		{
			label: "Lagerwert",
			value: formatEUR(summary.lagerwert),
			icon: Warehouse,
			sub: summary.lagerwertDate
				? `Letzte Inventur: ${formatDate(summary.lagerwertDate)}`
				: "Keine Inventur",
			color: "text-warning-muted-foreground",
		},
		{
			label: "Offene Mitgliederrechnungen",
			value: formatEUR(summary.offeneMitglieder),
			qualifier: "fällig",
			deferred: summary.gestundetMitglieder,
			icon: Users,
			color: "text-warning-muted-foreground",
		},
		{
			label: "Offene Gruppenrechnungen",
			value: formatEUR(summary.offeneGruppen),
			// Rare for groups: only shown when there is something deferred.
			...(summary.gestundetGruppen > 0
				? { qualifier: "fällig", deferred: summary.gestundetGruppen }
				: {}),
			icon: Receipt,
			color: "text-purple-600",
		},
		{
			label: "Externe Verbindlichkeiten",
			value: formatEUR(summary.externOffen),
			icon: Building2,
			color: "text-destructive",
		},
	];

	const gesamtColor = summary.gesamt >= 0 ? "text-success" : "text-destructive";

	return (
		<div className="flex flex-col gap-3">
			{/* Hero: Gesamtvermögen */}
			<Card className="border-primary">
				<CardContent className="flex items-center justify-between p-5">
					<div>
						<p className="text-muted-foreground text-sm">Gesamtvermögen</p>
						<p className={`font-bold text-3xl ${gesamtColor}`}>
							{formatEUR(summary.gesamt)}
						</p>
					</div>
					<Euro className={`size-10 ${gesamtColor}`} />
				</CardContent>
			</Card>

			{/* Supporting cards */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{supportingCards.map((c) => {
					const Icon = c.icon;
					return (
						<Card key={c.label}>
							<CardContent className="flex items-center gap-3 p-4">
								<Icon className={`size-5 shrink-0 ${c.color}`} />
								<div className="min-w-0">
									<p className="text-muted-foreground text-xs">{c.label}</p>
									<p className={`font-bold text-lg ${c.color}`}>
										{c.value}
										{c.qualifier && (
											<span className="ml-1.5 font-normal text-muted-foreground text-xs">
												{c.qualifier}
											</span>
										)}
									</p>
									{c.deferred !== undefined && (
										<p className="mt-1 flex items-center gap-1.5 text-xs">
											<StatusBadge {...billStatusStyle("Gestundet")}>
												Gestundet
											</StatusBadge>
											<span className="font-semibold">
												{formatEUR(c.deferred)}
											</span>
										</p>
									)}
									{c.sub && (
										<p className="text-muted-foreground text-xs">{c.sub}</p>
									)}
								</div>
							</CardContent>
						</Card>
					);
				})}

				{/* Pfand card — inline editable */}
				<Card>
					<CardContent className="flex items-center gap-3 p-4">
						<Package className="size-5 shrink-0 text-success" />
						<div className="min-w-0 flex-1">
							<p className="text-muted-foreground text-xs">Pfandguthaben</p>
							{editingPfand ? (
								<div className="mt-1 flex items-center gap-2">
									<Input
										inputMode="decimal"
										value={pfandInput}
										onChange={(e) => setPfandInput(e.target.value)}
										className="h-8 w-28 text-sm"
										placeholder="0,00"
										aria-label="Pfandwert in Euro"
										autoFocus
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												handleSavePfand();
											}
											if (e.key === "Escape") {
												setEditingPfand(false);
											}
										}}
									/>
									<IconButton
										label="Pfandwert speichern"
										size="icon-sm"
										onClick={handleSavePfand}
										disabled={isPending}
									>
										<CheckCircle className="text-success" />
									</IconButton>
									<IconButton
										label="Bearbeiten abbrechen"
										size="icon-sm"
										onClick={() => setEditingPfand(false)}
										disabled={isPending}
									>
										<X />
									</IconButton>
								</div>
							) : (
								<div className="flex items-center gap-2">
									<p className="font-bold text-lg text-success">
										{formatEUR(summary.pfand)}
									</p>
									<IconButton
										label="Pfandwert bearbeiten"
										size="icon-sm"
										onClick={() => setEditingPfand(true)}
									>
										<Pencil className="text-muted-foreground" />
									</IconButton>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
