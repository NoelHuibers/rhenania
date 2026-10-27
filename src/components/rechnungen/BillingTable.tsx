"use client";

import { ArrowUpDown, ReceiptText } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { EmptyState } from "~/components/ui/empty-state";
import { ErrorState } from "~/components/ui/error-state";
import { TableSkeleton } from "~/components/ui/page-skeleton";
import { BillStatusBadge } from "~/components/ui/status-badge";
import { formatEUR } from "~/lib/format";
import { Button } from "../ui/button";
import { DataList, type DataListColumn } from "../ui/data-list";
import type { BillingEntry } from "./BillingDashboard";
import { DefaultDetailsDialog } from "./DefaultDetailsDialog";
import { StatusButton } from "./StatusButton";

interface BillingTableProps {
	entries: BillingEntry[];
	showStatus?: boolean;
	isLoading?: boolean;
	error?: string | null;
	emptyMessage?: string;
	onStatusChange?: (entryId: string, newStatus: BillingEntry["status"]) => void;
	detailsComponent?: React.ComponentType<{ entry: BillingEntry }>;
	canEditStatus?: boolean;
}

type SortField = "name" | "totalDue";
type SortDirection = "asc" | "desc";

export const BillingTable = ({
	entries,
	showStatus = false,
	isLoading = false,
	error = null,
	emptyMessage = "Keine Einträge gefunden",
	onStatusChange,
	detailsComponent: DetailsComponent = DefaultDetailsDialog,
	canEditStatus = false,
}: BillingTableProps) => {
	const [sortField, setSortField] = useState<SortField>("name");
	const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortDirection(sortDirection === "asc" ? "desc" : "asc");
		} else {
			setSortField(field);
			setSortDirection("asc");
		}
	};

	const sortEntries = (entries: BillingEntry[]) => {
		return [...entries].sort((a, b) => {
			let aValue = sortField === "name" ? a.name : a.totalDue;
			let bValue = sortField === "name" ? b.name : b.totalDue;

			if (typeof aValue === "string") {
				aValue = aValue.toLowerCase();
				bValue = (bValue as string).toLowerCase();
			}

			if (sortDirection === "asc") {
				return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
			} else {
				return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
			}
		});
	};

	// Component for read-only status display
	const StatusDisplay = ({ status }: { status?: BillingEntry["status"] }) => (
		<BillStatusBadge status={status} />
	);

	if (isLoading) {
		return <TableSkeleton columns={showStatus ? 4 : 3} />;
	}

	if (error) {
		// `error` is a German sentence set by the dashboard, never a server
		// message. The data is fetched on the client, so a reload retries.
		return (
			<ErrorState
				title="Laden fehlgeschlagen"
				retryLabel="Neu laden"
				onRetry={() => window.location.reload()}
				className="py-8"
			>
				{error}
			</ErrorState>
		);
	}

	if (entries.length === 0) {
		return (
			<EmptyState variant="plain" icon={<ReceiptText />} title={emptyMessage} />
		);
	}

	const sortButton = (field: SortField, label: string) => (
		<Button
			variant="ghost"
			onClick={() => handleSort(field)}
			className="h-auto p-0 font-semibold hover:bg-transparent"
		>
			{label}
			<ArrowUpDown className="ml-2 h-4 w-4" />
		</Button>
	);

	const columns: DataListColumn<BillingEntry>[] = [
		{
			id: "name",
			header: () => sortButton("name", "Name"),
			cell: ({ row }) => row.original.name,
			meta: { mobile: "title", className: "font-medium md:min-w-[150px]" },
		},
		{
			id: "totalDue",
			header: () => sortButton("totalDue", "Gesamtbetrag"),
			cell: ({ row }) => formatEUR(row.original.totalDue),
			meta: {
				mobile: "subtitle",
				className: "md:min-w-[120px] md:text-right",
				cellClassName:
					"md:font-mono max-md:font-bold max-md:text-lg max-md:text-success",
			},
		},
	];
	if (showStatus) {
		columns.push({
			id: "status",
			header: "Status",
			cell: ({ row: { original: entry } }) =>
				canEditStatus && onStatusChange ? (
					<StatusButton
						status={entry.status}
						onStatusChange={(newStatus) => onStatusChange(entry.id, newStatus)}
					/>
				) : (
					<StatusDisplay status={entry.status} />
				),
			meta: { mobile: "meta", className: "md:min-w-[100px]" },
		});
	}
	columns.push({
		id: "actions",
		header: "Aktionen",
		cell: ({ row }) => <DetailsComponent entry={row.original} />,
		meta: { mobile: "action", className: "md:min-w-[100px] md:text-right" },
	});

	return (
		<DataList
			data={sortEntries(entries)}
			columns={columns}
			getRowId={(entry) => entry.id}
			caption="Rechnungen"
		/>
	);
};
