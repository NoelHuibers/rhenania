"use client";

import {
	AlertCircle,
	Calendar,
	CheckCircle,
	ChevronDown,
	ChevronUp,
	Package,
	PartyPopper,
	TrendingDown,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { formatDateTime, formatEUR } from "~/lib/format";
import type { InventoryWithItems } from "./utils";

interface HistoryTabProps {
	history: InventoryWithItems[];
}

function DiffBadge({ difference }: { difference: number }) {
	if (difference === 0) {
		return (
			<Badge className="bg-success-muted text-success-muted-foreground">
				<CheckCircle className="mr-1 h-3 w-3" />
				OK
			</Badge>
		);
	}
	if (difference > 0) {
		return (
			<Badge className="bg-info-muted text-info-muted-foreground">
				<TrendingDown className="mr-1 h-3 w-3 rotate-180" />+{difference}
			</Badge>
		);
	}
	return (
		<Badge className="bg-danger-muted text-danger-muted-foreground">
			<TrendingDown className="mr-1 h-3 w-3" />
			{difference}
		</Badge>
	);
}

export function HistoryTab({ history }: HistoryTabProps) {
	const [expandedRecords, setExpandedRecords] = useState<Set<string>>(
		new Set(),
	);

	const toggle = (id: string) => {
		setExpandedRecords((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	if (history.length === 0) {
		return (
			<div className="py-16 text-center">
				<Package className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
				<p className="text-muted-foreground">
					Noch keine Inventur-Aufzeichnungen vorhanden.
				</p>
				<p className="mt-1 text-muted-foreground text-sm">
					Speichern Sie Ihre erste Inventur, um die Historie zu sehen.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<h2 className="font-semibold text-lg">Inventur-Verlauf</h2>

			{history.map((record, index) => {
				const isExpanded = expandedRecords.has(record.id);
				const totalItems = record.items.length;
				const itemsWithLoss = record.items.filter(
					(i) => i.difference < 0,
				).length;
				const itemsWithSurplus = record.items.filter(
					(i) => i.difference > 0,
				).length;
				const correctItems = record.items.filter(
					(i) => i.difference === 0,
				).length;
				const totalDiff = record.items.reduce((s, i) => s + i.difference, 0);

				return (
					<div key={record.id} className="rounded-lg border">
						<Collapsible
							open={isExpanded}
							onOpenChange={() => toggle(record.id)}
						>
							<CollapsibleTrigger asChild>
								<button
									type="button"
									className="flex w-full flex-col gap-3 p-4 text-left transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
								>
									{/* Left: title + date */}
									<div className="flex items-center gap-2">
										{index === 0 && (
											<Badge variant="default" className="shrink-0 text-xs">
												Letzte
											</Badge>
										)}
										<span className="font-semibold">
											Inventur #{history.length - index}
										</span>
										<span className="flex items-center gap-1 text-muted-foreground text-xs">
											<Calendar className="h-3 w-3" />
											{formatDateTime(record.inventoryDate)}
										</span>
										{record.kind === "event" && (
											<Badge
												variant="outline"
												className="shrink-0 border-warning/40 bg-warning-muted text-warning-muted-foreground text-xs"
											>
												<PartyPopper className="mr-1 h-3 w-3" />
												{record.eventName ?? "Veranstaltung"}
											</Badge>
										)}
									</div>

									{/* Right: badges + chevron */}
									<div className="flex flex-wrap items-center gap-1.5">
										<Badge variant="outline" className="text-xs">
											{totalItems} Artikel
										</Badge>
										{correctItems > 0 && (
											<Badge
												variant="outline"
												className="border-success/40 text-success text-xs"
											>
												{correctItems} OK
											</Badge>
										)}
										{itemsWithLoss > 0 && (
											<Badge
												variant="outline"
												className="border-danger/40 text-destructive text-xs"
											>
												{itemsWithLoss} Verlust
											</Badge>
										)}
										{itemsWithSurplus > 0 && (
											<Badge
												variant="outline"
												className="border-info/40 text-info text-xs"
											>
												{itemsWithSurplus} Überschuss
											</Badge>
										)}
										{record.profit !== null && (
											<Badge
												variant="outline"
												className="border-success/40 text-success text-xs"
											>
												Gewinn {formatEUR(record.profit)}
											</Badge>
										)}
										<Badge
											variant={
												record.kind === "event" ? "outline" : "destructive"
											}
											className={
												record.kind === "event"
													? "border-warning/40 text-warning-muted-foreground text-xs"
													: "text-xs"
											}
										>
											{record.kind === "event" ? "Verbrauch " : ""}
											{formatEUR(record.totalLosses)}
										</Badge>
										<span className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center">
											{isExpanded ? (
												<ChevronUp className="h-4 w-4" />
											) : (
												<ChevronDown className="h-4 w-4" />
											)}
										</span>
									</div>
								</button>
							</CollapsibleTrigger>

							<CollapsibleContent>
								<div className="border-t px-4 py-4">
									{/* Summary strip */}
									<div
										className={`mb-4 grid grid-cols-2 gap-2 ${
											record.profit !== null
												? "sm:grid-cols-5"
												: "sm:grid-cols-4"
										}`}
									>
										{[
											{
												label: "Geprüfte Artikel",
												value: totalItems,
												cls: "text-primary",
											},
											{
												label: "Korrekte Bestände",
												value: correctItems,
												cls: "text-success",
											},
											{
												label: "Artikel mit Verlust",
												value: itemsWithLoss,
												cls: "text-destructive",
											},
											{
												label: "Gesamtverlust",
												value: formatEUR(record.totalLosses),
												cls: "text-destructive",
											},
											...(record.profit !== null
												? [
														{
															label: "Gewinn aus Aufschlag",
															value: formatEUR(record.profit),
															cls: "text-success",
														},
													]
												: []),
										].map((s) => (
											<div
												key={s.label}
												className="rounded-md border px-3 py-2 text-center"
											>
												<p className={`font-bold text-lg ${s.cls}`}>
													{s.value}
												</p>
												<p className="text-muted-foreground text-xs">
													{s.label}
												</p>
											</div>
										))}
									</div>

									{/* Items table */}
									<div className="rounded-md border">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Getränk</TableHead>
													<TableHead className="hidden text-right sm:table-cell">
														Gezählt
													</TableHead>
													<TableHead className="hidden text-right sm:table-cell">
														Erwartet
													</TableHead>
													<TableHead className="text-right">
														Differenz
													</TableHead>
													<TableHead className="hidden text-center sm:table-cell">
														Status
													</TableHead>
													<TableHead className="text-right">
														Verlust (€)
													</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{record.items
													.sort((a, b) => b.lossValue - a.lossValue)
													.map((item) => (
														<TableRow key={`${record.id}-${item.drinkId}`}>
															<TableCell className="font-medium">
																{item.drinkName}
															</TableCell>
															<TableCell className="hidden text-right sm:table-cell">
																{item.countedStock}
															</TableCell>
															<TableCell className="hidden text-right sm:table-cell">
																{item.expectedStock}
															</TableCell>
															<TableCell className="text-right">
																<span
																	className={
																		item.difference < 0
																			? "font-semibold text-destructive"
																			: item.difference > 0
																				? "font-semibold text-info"
																				: "text-muted-foreground"
																	}
																>
																	{item.difference > 0 ? "+" : ""}
																	{item.difference}
																</span>
															</TableCell>
															<TableCell className="hidden text-center sm:table-cell">
																<DiffBadge difference={item.difference} />
															</TableCell>
															<TableCell className="text-right">
																{item.lossValue > 0 ? (
																	<span className="font-semibold text-destructive">
																		{formatEUR(item.lossValue)}
																	</span>
																) : (
																	<span className="text-muted-foreground">
																		-
																	</span>
																)}
															</TableCell>
														</TableRow>
													))}
											</TableBody>
											<TableFooter>
												<TableRow>
													<TableCell className="font-bold">Gesamt</TableCell>
													<TableCell className="hidden text-right font-bold sm:table-cell">
														{record.items.reduce(
															(s, i) => s + i.countedStock,
															0,
														)}
													</TableCell>
													<TableCell className="hidden sm:table-cell" />
													<TableCell className="text-right font-bold">
														<span
															className={
																totalDiff < 0 ? "text-destructive" : ""
															}
														>
															{totalDiff > 0 ? "+" : ""}
															{totalDiff}
														</span>
													</TableCell>
													<TableCell className="hidden sm:table-cell" />
													<TableCell className="text-right font-bold text-destructive">
														{formatEUR(record.totalLosses)}
													</TableCell>
												</TableRow>
											</TableFooter>
										</Table>
									</div>

									{/* Loss analysis */}
									{itemsWithLoss > 0 && (
										<div className="mt-3 flex items-start gap-2 rounded-lg bg-danger-muted p-3">
											<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
											<div className="min-w-0">
												<p className="font-semibold text-danger-muted-foreground text-sm">
													Verlustanalyse
												</p>
												<p className="mt-1 text-danger-muted-foreground text-xs">
													{itemsWithLoss} von {totalItems} Artikeln zeigen
													Verluste. Größte Verluste:{" "}
													{record.items
														.filter((i) => i.lossValue > 0)
														.sort((a, b) => b.lossValue - a.lossValue)
														.slice(0, 3)
														.map(
															(i) =>
																`${i.drinkName} (${formatEUR(i.lossValue)})`,
														)
														.join(", ")}
												</p>
											</div>
										</div>
									)}
								</div>
							</CollapsibleContent>
						</Collapsible>
					</div>
				);
			})}
		</div>
	);
}
