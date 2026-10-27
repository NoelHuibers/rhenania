"use client";

import {
	ChevronDown,
	Download,
	MoreHorizontal,
	Pencil,
	PiggyBank,
	Plus,
	Receipt,
	Upload,
} from "lucide-react";
import { useRef } from "react";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { formatEUR } from "~/lib/format";
import type { KostenpunktWithPositions } from "~/server/actions/cc-kasse/kostenpunkte";

/** Header of the Etatplan editor: totals, plan menu (edit, Excel) and booking buttons. */
export function EtaplanToolbar({
	kostenpunkte,
	isPending,
	isTreasury,
	onEditEtaplan,
	onExport,
	onImportFile,
	onBook,
	onNewEinnahme,
	onNewKp,
}: {
	kostenpunkte: KostenpunktWithPositions[];
	isPending: boolean;
	isTreasury: boolean;
	onEditEtaplan: () => void;
	onExport: () => void;
	onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onBook: () => void;
	onNewEinnahme: () => void;
	onNewKp: () => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex min-w-0 items-center gap-2">
				<div className="min-w-0">
					<h2 className="font-semibold text-base">Kostenpunkte</h2>
					<p className="text-muted-foreground text-xs tabular-nums">
						{kostenpunkte.length} Posten · Budget{" "}
						{formatEUR(kostenpunkte.reduce((s, k) => s + k.budget, 0))}
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
						<DropdownMenuItem onClick={onEditEtaplan}>
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
							<DropdownMenuItem onClick={onBook}>
								<Receipt />
								<div>
									<div>Ausgabe</div>
									<div className="text-muted-foreground text-xs">
										Direkt bezahlte Rechnung
									</div>
								</div>
							</DropdownMenuItem>
							<DropdownMenuItem onClick={onNewEinnahme}>
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
					onClick={onNewKp}
					className={isTreasury ? undefined : "col-span-2"}
				>
					<Plus /> Kostenpunkt
				</Button>
			</div>
		</div>
	);
}
