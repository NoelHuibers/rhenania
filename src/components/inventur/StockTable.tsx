"use client";

import { DataList, type DataListColumn } from "~/components/ui/data-list";
import { Input } from "~/components/ui/input";
import { StatusBadge } from "~/components/ui/status-badge";
import { formatEUR } from "~/lib/format";
import { NumericInput } from "../NumericInput";
import type { StockStatusWithDetails } from "./utils";
import { calculateLostValue, getStockStatus } from "./utils";

/** One drink in the stock list, with its computed Soll/Ist figures. */
type StockRow = {
	item: StockStatusWithDetails;
	p: number;
	calc: number;
	actual: number;
	diff: number;
	lostValue: number;
	status: ReturnType<typeof getStockStatus>;
	isChanged: boolean;
};

function diffClass(diff: number) {
	if (diff < 0) {
		return "text-destructive font-semibold";
	}
	if (diff > 0) {
		return "text-success font-semibold";
	}
	return "text-muted-foreground";
}

/** The stock list: a table from md up, one card per drink below. */
export function StockTable({
	stockItems,
	purchases,
	countedStock,
	changedItems,
	disabled,
	onPurchaseInput,
	onCountedStockInput,
}: {
	stockItems: StockStatusWithDetails[];
	purchases: { [key: string]: number };
	countedStock: { [key: string]: number };
	changedItems: Set<string>;
	disabled: boolean;
	onPurchaseInput: (drinkId: string, value: number) => void;
	onCountedStockInput: (drinkId: string, value: number) => void;
}) {
	const stockRows: StockRow[] = stockItems.map((item) => {
		const p = purchases[item.drinkId] || 0;
		const calc = item.lastInventoryStock + p - item.soldSince;
		const actual = countedStock[item.drinkId] ?? calc;
		return {
			item,
			p,
			calc,
			actual,
			diff: actual - calc,
			lostValue: calculateLostValue({ ...item, calculatedStock: calc }, actual),
			status: getStockStatus({ calculatedStock: calc }, actual),
			isChanged: changedItems.has(item.drinkId),
		};
	});

	const stockColumns: DataListColumn<StockRow>[] = [
		{
			id: "drink",
			header: "Getränk",
			cell: ({ row: { original: r } }) => (
				<>
					{r.item.drinkName}
					{r.isChanged && <span className="ml-2 text-info text-xs">●</span>}
				</>
			),
			meta: { mobile: "title", className: "font-medium" },
		},
		{
			id: "lastInventory",
			header: "Letzte Inventur",
			cell: ({ row }) => row.original.item.lastInventoryStock,
			meta: { mobile: "meta", className: "md:text-right" },
		},
		{
			id: "purchased",
			header: "Eingekauft (+)",
			cell: ({ row: { original: r } }) => (
				<div className="flex items-center gap-1 md:justify-center">
					{r.p > 0 && <span className="font-bold text-success">+</span>}
					<Input
						type="number"
						aria-label={`Eingekauft – ${r.item.drinkName}`}
						value={r.p || ""}
						onChange={(e) =>
							onPurchaseInput(
								r.item.drinkId,
								e.target.value === "" ? 0 : Number(e.target.value),
							)
						}
						className={`h-8 w-20 ${r.p > 0 ? "border-success font-semibold text-success" : ""}`}
						min="0"
						placeholder="0"
						disabled={disabled}
					/>
				</div>
			),
			meta: {
				mobile: "meta",
				label: "Eingekauft",
				headerClassName: "text-center text-success",
				cellClassName: "md:text-center",
			},
		},
		{
			id: "sold",
			header: "Verkauft (−)",
			cell: ({ row }) => {
				const sold = row.original.item.soldSince;
				// Nothing sold: a plain 0, not a red "−0".
				return sold === 0 ? (
					<span className="text-muted-foreground">0</span>
				) : (
					<span className="font-semibold text-destructive">−{sold}</span>
				);
			},
			meta: {
				mobile: "meta",
				label: "Verkauft",
				className: "md:text-right",
				headerClassName: "text-destructive",
			},
		},
		{
			id: "calc",
			header: "Soll",
			cell: ({ row }) => row.original.calc,
			meta: { mobile: "meta", className: "md:text-right" },
		},
		{
			id: "actual",
			header: "Ist",
			cell: ({ row: { original: r } }) => (
				<NumericInput
					min={0}
					aria-label={`Ist – ${r.item.drinkName}`}
					value={r.actual}
					onChange={(value) => onCountedStockInput(r.item.drinkId, value)}
					className="h-8 w-20 md:mx-auto"
					disabled={disabled}
				/>
			),
			meta: { mobile: "meta", className: "md:text-center" },
		},
		{
			id: "diff",
			header: "Differenz",
			cell: ({ row: { original: r } }) => (
				<span className={diffClass(r.diff)}>
					{r.diff > 0 ? `+${r.diff}` : r.diff}
				</span>
			),
			meta: { mobile: "meta", className: "md:text-right" },
		},
		{
			id: "price",
			header: "Preis",
			cell: ({ row }) => formatEUR(row.original.item.currentPrice),
			meta: { mobile: "meta", className: "md:text-right" },
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row: { original: r } }) => (
				<StatusBadge tone={r.status.tone} strong={r.status.strong}>
					{r.status.label}
				</StatusBadge>
			),
			meta: { mobile: "subtitle", className: "md:text-center" },
		},
		{
			id: "lost",
			header: "Verlust (€)",
			cell: ({ row: { original: r } }) =>
				r.lostValue > 0 ? formatEUR(r.lostValue) : "-",
			meta: {
				mobile: "meta",
				label: "Verlust",
				className: "md:text-right",
				headerClassName: "text-destructive",
				cellClassName: "font-semibold text-destructive",
			},
		},
	];

	return (
		<DataList
			data={stockRows}
			columns={stockColumns}
			getRowId={(r) => r.item.drinkId}
			caption="Aktueller Bestand"
			metaLayout="grid"
			className="mt-4 md:rounded-md md:border"
			rowClassName={(r) =>
				r.isChanged ? "bg-info-muted max-md:border-info/40" : undefined
			}
		/>
	);
}
