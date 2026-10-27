"use client";

import { ReceiptText, SearchX } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DataList, type DataListColumn } from "~/components/ui/data-list";
import { EmptyState } from "~/components/ui/empty-state";
import { formatDate, formatEUR, formatTime } from "~/lib/format";

/** One drink purchase as listed in the transaction tracker. */
export interface Transaction {
	id: string;
	userId: string;
	userName: string;
	drinkId: string;
	drinkName: string;
	amount: number;
	pricePerUnit: number;
	total: number;
	inBill: boolean;
	bookingFor: string | null;
	bookedByAdminName: string | null;
	createdAt: Date;
}

// Component: Empty State
const TransactionsEmpty = ({ hasFilters }: { hasFilters: boolean }) => (
	<EmptyState
		variant="plain"
		icon={hasFilters ? <SearchX /> : <ReceiptText />}
		title="Keine Transaktionen gefunden"
	>
		{hasFilters
			? "Keine Transaktion passt zu den Filtern. Ändere die Suche oder setze die Filter zurück."
			: "Sobald jemand ein Getränk bestellt, erscheint es hier."}
	</EmptyState>
);

const ADMIN_BADGE = "border-purple-300 bg-purple-50 text-purple-700";

const hasPurpose = (t: Transaction) =>
	!!t.bookingFor && t.bookingFor.trim() !== "";

const TRANSACTION_COLUMNS: DataListColumn<Transaction>[] = [
	{
		id: "user",
		header: "Käufer",
		cell: ({ row }) => row.original.userName,
		meta: { mobile: "title", className: "font-medium max-md:font-semibold" },
	},
	{
		id: "drink",
		header: "Getränk",
		cell: ({ row }) => row.original.drinkName,
		meta: { mobile: "subtitle" },
	},
	{
		id: "amount",
		header: "Menge",
		cell: ({ row }) => `${row.original.amount}x`,
		meta: { mobile: "meta", className: "font-mono" },
	},
	{
		id: "pricePerUnit",
		header: "Preis/Einheit",
		cell: ({ row }) => formatEUR(row.original.pricePerUnit),
		meta: { mobile: "meta", className: "font-mono" },
	},
	{
		id: "total",
		header: "Gesamt",
		cell: ({ row }) => formatEUR(row.original.total),
		meta: { mobile: "meta", className: "font-mono font-semibold" },
	},
	{
		id: "purpose",
		header: "Zweck",
		cell: ({ row: { original: t } }) =>
			hasPurpose(t) ? (
				<Badge variant="secondary">{t.bookingFor}</Badge>
			) : (
				<span className="text-muted-foreground">Persönlich</span>
			),
		meta: { mobile: "meta" },
	},
	{
		id: "bookedBy",
		header: "Gebucht von",
		cell: ({ row: { original: t } }) =>
			t.bookedByAdminName ? (
				<Badge variant="outline" className={ADMIN_BADGE}>
					{t.bookedByAdminName}
				</Badge>
			) : (
				<span className="text-muted-foreground">—</span>
			),
		meta: { mobile: "meta" },
	},
	{
		id: "date",
		header: "Datum",
		cell: ({ row }) => formatDate(row.original.createdAt),
		meta: { mobile: "meta" },
	},
	{
		id: "time",
		header: "Uhrzeit",
		cell: ({ row }) => formatTime(row.original.createdAt, { seconds: true }),
		meta: { mobile: "meta", className: "font-mono" },
	},
	{
		id: "billStatus",
		header: "Rechnungsstatus",
		cell: ({ row: { original: t } }) => (
			<Badge variant={t.inBill ? "default" : "outline"}>
				{t.inBill ? "Abgerechnet" : "Offen"}
			</Badge>
		),
		meta: { mobile: "meta" },
	},
];

// Component: Transaction list (table from md up, cards below)
interface TransactionListProps {
	transactions: Transaction[];
	hasFilters: boolean;
}

export const TransactionList = ({
	transactions,
	hasFilters,
}: TransactionListProps) => (
	<Card className="max-md:gap-3 max-md:overflow-visible max-md:bg-transparent max-md:py-0 max-md:shadow-none max-md:ring-0">
		<CardHeader className="max-md:px-0">
			<CardTitle className="max-md:font-semibold max-md:text-lg">
				Transaktionsverlauf ({transactions.length} Transaktionen)
			</CardTitle>
		</CardHeader>
		<CardContent className="max-md:px-0">
			<div className="md:rounded-md md:border">
				<DataList
					data={transactions}
					columns={TRANSACTION_COLUMNS}
					getRowId={(t) => t.id}
					caption="Transaktionen"
					metaLayout="grid"
					empty={
						<div className="max-md:rounded-xl max-md:border max-md:bg-card">
							<TransactionsEmpty hasFilters={hasFilters} />
						</div>
					}
				/>
			</div>
		</CardContent>
	</Card>
);
