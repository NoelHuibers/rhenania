// DefaultDetailsDialog.tsx

import { formatEUR } from "~/lib/format";
import { Button } from "../ui/button";
import { DataList, type DataListColumn } from "../ui/data-list";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import type { BillingEntry } from "./BillingDashboard";

type BillItem = BillingEntry["items"][number];

const ITEM_COLUMNS: DataListColumn<BillItem>[] = [
	{
		id: "name",
		header: "Artikel",
		cell: ({ row }) => row.original.name,
		meta: {
			mobile: "title",
			className: "font-medium max-md:break-words max-md:text-sm",
		},
	},
	{
		id: "quantity",
		header: "Anzahl",
		cell: ({ row }) => row.original.quantity,
		meta: { mobile: "meta", className: "md:text-right" },
	},
	{
		id: "unitPrice",
		header: "Einzelpreis",
		cell: ({ row }) => formatEUR(row.original.unitPrice),
		meta: { mobile: "meta", className: "md:text-right" },
	},
	{
		id: "subtotal",
		header: "Zwischensumme",
		cell: ({ row }) => formatEUR(row.original.subtotal),
		meta: {
			mobile: "meta",
			className: "font-medium md:text-right",
			cellClassName: "max-md:border-t max-md:pt-1.5 max-md:font-semibold",
		},
	},
];

/** The non-zero bill parts besides the drinks, so the lines add up to Gesamt. */
function billExtras(entry: BillingEntry): Array<[string, number]> {
	const extras: Array<[string, number | undefined]> = [
		["Übertrag", entry.oldBillingAmount],
		["Mahnung", entry.fees],
		["Umlage", entry.umlage],
	];
	return extras.filter((extra): extra is [string, number] => !!extra[1]);
}

export const DefaultDetailsDialog = ({ entry }: { entry: BillingEntry }) => (
	<Dialog>
		<DialogTrigger asChild>
			<Button variant="outline" size="sm">
				Details
			</Button>
		</DialogTrigger>
		<DialogContent className="mx-auto flex max-h-[90vh] w-[95vw] max-w-2xl flex-col">
			<DialogHeader className="flex-shrink-0">
				<DialogTitle className="break-words text-base sm:text-lg">
					Bestelldetails - {entry.name}
				</DialogTitle>
			</DialogHeader>
			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
				<DataList
					data={entry.items}
					columns={ITEM_COLUMNS}
					getRowId={(item) => item.id}
					caption="Artikel"
					rowClassName="max-md:border-0 max-md:bg-muted"
				/>

				{billExtras(entry).length > 0 && (
					<dl className="space-y-1 border-border border-t pt-4 text-sm">
						{billExtras(entry).map(([label, amount]) => (
							<div key={label} className="flex items-center justify-between">
								<dt className="text-muted-foreground">{label}</dt>
								<dd className="font-medium">{formatEUR(amount)}</dd>
							</div>
						))}
					</dl>
				)}

				<div className="flex items-center justify-between border-border border-t pt-4">
					<span className="font-semibold text-base sm:text-lg">Gesamt:</span>
					<span className="font-bold text-lg text-success sm:text-xl">
						{formatEUR(entry.totalDue)}
					</span>
				</div>
			</div>
		</DialogContent>
	</Dialog>
);
