"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DataList, type DataListColumn } from "~/components/ui/data-list";
import { formatDate, formatEUR } from "~/lib/format";
import {
	getMyOrdersPage,
	type MyOrder,
	type MyOrdersPage,
	type MyOrdersQuery,
} from "~/server/actions/orders";
import { RecentOrdersFilters } from "./RecentOrdersFilters";

const ORDER_COLUMNS: DataListColumn<MyOrder>[] = [
	{
		id: "date",
		header: "Datum",
		cell: ({ row }) => formatDate(new Date(row.original.createdAt)),
		meta: {
			mobile: "subtitle",
			className: "align-top",
			cellClassName: "max-md:order-first",
		},
	},
	{
		id: "drink",
		header: "Getränk",
		cell: ({ row }) => row.original.drinkName,
		meta: { mobile: "title", className: "align-top font-medium" },
	},
	{
		id: "amount",
		header: "Anzahl",
		cell: ({ row }) => row.original.amount,
		meta: { mobile: "meta", className: "align-top md:text-right" },
	},
	{
		id: "total",
		header: "Gesamt",
		cell: ({ row }) => formatEUR(row.original.total),
		meta: {
			mobile: "meta",
			className: "align-top md:text-right",
			cellClassName: "max-md:font-semibold",
		},
	},
	{
		id: "status",
		header: "Status",
		cell: ({ row }) =>
			row.original.inBill ? (
				<Badge variant="secondary">Abgerechnet</Badge>
			) : (
				<span className="md:hidden">Nicht abgerechnet</span>
			),
		meta: { mobile: "meta", className: "align-top" },
	},
];

type Filters = {
	showOutOfBillOnly: boolean;
	fromDate: string; // YYYY-MM-DD
	toDate: string; // YYYY-MM-DD
};

const NO_FILTERS: Filters = {
	showOutOfBillOnly: false,
	fromDate: "",
	toDate: "",
};

/** The filters as the server takes them; days start and end in the browser's time zone. */
function toQuery(filters: Filters, page: number): MyOrdersQuery {
	return {
		page,
		outOfBillOnly: filters.showOutOfBillOnly,
		from: filters.fromDate
			? new Date(`${filters.fromDate}T00:00:00.000`).toISOString()
			: null,
		to: filters.toDate
			? new Date(`${filters.toDate}T23:59:59.999`).toISOString()
			: null,
	};
}

/** Placeholder while the first page streams in. */
export function RecentOrdersSkeleton() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Letzte Bestellungen</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="py-8">
					<div className="animate-pulse space-y-4">
						<div className="h-4 w-1/3 rounded bg-muted" />
						<div className="h-24 w-full rounded bg-muted" />
						<div className="h-4 w-2/3 rounded bg-muted" />
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

/**
 * The member's orders, newest first. The first page comes from the server;
 * filters and paging fetch one page at a time (#24).
 */
export function RecentOrders({
	initial,
	initialError = null,
}: {
	initial: MyOrdersPage;
	/** Set when the server could not load the first page. */
	initialError?: string | null;
}) {
	const [filters, setFilters] = useState<Filters>(NO_FILTERS);
	const [data, setData] = useState<MyOrdersPage>(initial);
	const [error, setError] = useState<string | null>(initialError);
	const [isPending, startTransition] = useTransition();
	const latestRequest = useRef(0);

	const { showOutOfBillOnly, fromDate, toDate } = filters;
	const hasAnyFilter = showOutOfBillOnly || !!fromDate || !!toDate;

	const load = (nextFilters: Filters, page: number) => {
		setFilters(nextFilters);
		const request = ++latestRequest.current;
		startTransition(async () => {
			try {
				const next = await getMyOrdersPage(toQuery(nextFilters, page));
				// A slower answer to an older filter must not overwrite a newer one.
				if (request === latestRequest.current) {
					setData(next);
					setError(null);
				}
			} catch (err) {
				if (request === latestRequest.current) {
					setError(
						err instanceof Error
							? err.message
							: "Fehler beim Laden der Bestellungen",
					);
				}
			}
		});
	};

	// Changing a filter starts again at the first page.
	const setFilter = (patch: Partial<Filters>) =>
		load({ ...filters, ...patch }, 1);

	const currentPage = data.page;
	const itemsPerPage = data.pageSize;
	const totalPages = Math.ceil(data.total / itemsPerPage) || 1;
	const startIndex = (currentPage - 1) * itemsPerPage;

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Letzte Bestellungen</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-center py-8">
						<p className="text-destructive">Fehler: {error}</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Letzte Bestellungen</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4" aria-busy={isPending}>
				<RecentOrdersFilters
					showOutOfBillOnly={showOutOfBillOnly}
					setShowOutOfBillOnly={(value) =>
						setFilter({ showOutOfBillOnly: value })
					}
					fromDate={fromDate}
					setFromDate={(value) => setFilter({ fromDate: value })}
					toDate={toDate}
					setToDate={(value) => setFilter({ toDate: value })}
					hasAnyFilter={hasAnyFilter}
					resetFilters={() => load(NO_FILTERS, 1)}
				/>

				<DataList
					data={data.orders}
					columns={ORDER_COLUMNS}
					getRowId={(order) => order.id}
					caption="Letzte Bestellungen"
					className="md:rounded-md md:border"
					headerClassName="bg-muted/50"
					empty={
						<div className="rounded-lg border p-6 text-center">
							<p className="text-muted-foreground">
								Keine Bestellungen gefunden
							</p>
						</div>
					}
				/>

				{/* Pagination */}
				{data.total > 0 && (
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
						<p className="text-muted-foreground text-sm">
							Zeige {startIndex + 1} bis{" "}
							{Math.min(startIndex + itemsPerPage, data.total)} von {data.total}{" "}
							Bestellungen
						</p>
						<div className="flex items-center justify-between gap-2 sm:justify-end">
							<Button
								variant="outline"
								size="sm"
								className="h-9 px-3"
								onClick={() => load(filters, Math.max(currentPage - 1, 1))}
								disabled={currentPage === 1 || isPending}
								aria-label="Vorherige Seite"
							>
								<ChevronLeft className="h-4 w-4" />
							</Button>
							<span className="text-sm">
								Seite {currentPage} von {totalPages}
							</span>
							<Button
								variant="outline"
								size="sm"
								className="h-9 px-3"
								onClick={() =>
									load(filters, Math.min(currentPage + 1, totalPages))
								}
								disabled={currentPage === totalPages || isPending}
								aria-label="Nächste Seite"
							>
								<ChevronRight className="h-4 w-4" />
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
