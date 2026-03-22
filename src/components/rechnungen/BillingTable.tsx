"use client";

import { ArrowUpDown, Loader2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "../ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../ui/table";
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

// Utility function
export const formatCurrency = (amount: number) => {
	return new Intl.NumberFormat("de-DE", {
		style: "currency",
		currency: "EUR",
	}).format(amount);
};

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
		<span
			className={`rounded-full px-2 py-1 font-medium text-xs ${
				status === "Bezahlt"
					? "bg-green-100 text-green-800"
					: status === "Gestundet"
						? "bg-yellow-100 text-yellow-800"
						: "bg-red-100 text-red-800"
			}`}
		>
			{status || "Unbezahlt"}
		</span>
	);

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-8">
				<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				Lädt...
			</div>
		);
	}

	if (error) {
		return <div className="py-8 text-center text-red-600">{error}</div>;
	}

	if (entries.length === 0) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				{emptyMessage}
			</div>
		);
	}

	return (
		<>
			<div className="block space-y-3 sm:hidden">
				{sortEntries(entries).map((entry) => (
					<div key={entry.id} className="space-y-3 rounded-lg border p-4">
						<div className="flex items-start justify-between">
							<div className="min-w-0 flex-1">
								<h3 className="truncate font-medium">{entry.name}</h3>
								<p className="mt-1 font-bold text-lg text-primary">
									{formatCurrency(entry.totalDue)}
								</p>
							</div>
							<DetailsComponent entry={entry} />
						</div>
						{showStatus && (
							<div className="flex items-center justify-between border-t pt-2">
								<span className="text-muted-foreground text-sm">Status:</span>
								{canEditStatus && onStatusChange ? (
									<StatusButton
										status={entry.status}
										onStatusChange={(newStatus) =>
											onStatusChange(entry.id, newStatus)
										}
									/>
								) : (
									<StatusDisplay status={entry.status} />
								)}
							</div>
						)}
					</div>
				))}
			</div>

			<div className="hidden overflow-x-auto sm:block">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="min-w-[150px]">
								<Button
									variant="ghost"
									onClick={() => handleSort("name")}
									className="h-auto p-0 font-semibold hover:bg-transparent"
								>
									Name
									<ArrowUpDown className="ml-2 h-4 w-4" />
								</Button>
							</TableHead>
							<TableHead className="min-w-[120px] text-right">
								<Button
									variant="ghost"
									onClick={() => handleSort("totalDue")}
									className="h-auto p-0 font-semibold hover:bg-transparent"
								>
									Gesamtbetrag
									<ArrowUpDown className="ml-2 h-4 w-4" />
								</Button>
							</TableHead>
							{showStatus && (
								<TableHead className="min-w-[100px]">Status</TableHead>
							)}
							<TableHead className="min-w-[100px] text-right">
								Aktionen
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{sortEntries(entries).map((entry) => (
							<TableRow key={entry.id}>
								<TableCell className="font-medium">{entry.name}</TableCell>
								<TableCell className="text-right font-mono">
									{formatCurrency(entry.totalDue)}
								</TableCell>
								{showStatus && (
									<TableCell>
										{canEditStatus && onStatusChange ? (
											<StatusButton
												status={entry.status}
												onStatusChange={(newStatus) =>
													onStatusChange(entry.id, newStatus)
												}
											/>
										) : (
											<StatusDisplay status={entry.status} />
										)}
									</TableCell>
								)}
								<TableCell className="text-right">
									<DetailsComponent entry={entry} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</>
	);
};
