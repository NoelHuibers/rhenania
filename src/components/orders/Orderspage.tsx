"use client";

import { Filter, Pause, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { ErrorState } from "~/components/ui/error-state";
import { IconButton } from "~/components/ui/icon-button";
import { TableSkeleton } from "~/components/ui/page-skeleton";
import {
	getTransactionCount,
	getTransactions,
	type TransactionFilters,
} from "~/server/actions/transactions/tracking";
import {
	DesktopFilters,
	MobileFilterSheet,
	SearchBar,
} from "./TransactionFilters";
import { type Transaction, TransactionList } from "./TransactionList";

// Component: Header Controls
interface HeaderControlsProps {
	totalCount: number;
	refreshing: boolean;
	isLiveTracking: boolean;
	onRefresh: () => void;
	onToggleLiveTracking: () => void;
	onOpenFilters?: () => void;
}

const HeaderControls = ({
	totalCount,
	refreshing,
	isLiveTracking,
	onRefresh,
	onToggleLiveTracking,
	onOpenFilters,
}: HeaderControlsProps) => (
	<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
		<div>
			<p className="mt-1 text-muted-foreground text-sm sm:text-base">
				Überwachen und analysieren Sie Getränkekauf-Transaktionen ({totalCount}{" "}
				gesamt)
			</p>
		</div>

		<div className="mt-4 flex items-center gap-2 sm:mt-0 sm:gap-4">
			<Button
				onClick={onRefresh}
				variant="outline"
				size="sm"
				disabled={refreshing}
				className="gap-2"
			>
				<RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
				<span className="hidden sm:inline">Aktualisieren</span>
			</Button>

			<div className="hidden items-center gap-2 sm:flex">
				<div
					className={`h-2 w-2 rounded-full ${
						isLiveTracking
							? "animate-pulse bg-success text-success-foreground"
							: "bg-muted"
					}`}
				/>
				<span className="text-muted-foreground text-sm">
					{isLiveTracking ? "Live-Tracking" : "Manuell"}
				</span>
			</div>

			<Button
				onClick={onToggleLiveTracking}
				variant={isLiveTracking ? "destructive" : "default"}
				className="gap-2"
			>
				{isLiveTracking ? (
					<Pause className="h-4 w-4" />
				) : (
					<Play className="h-4 w-4" />
				)}
				<span className="hidden sm:inline">
					{isLiveTracking
						? "Auto-Aktualisierung stoppen"
						: "Auto-Aktualisierung starten"}
				</span>
			</Button>

			{/* Mobile Filter Button */}
			{onOpenFilters && (
				<IconButton
					size="icon-sm"
					label="Filter"
					onClick={onOpenFilters}
					variant="outline"
					className="sm:hidden"
				>
					<Filter className="h-4 w-4" />
				</IconButton>
			)}
		</div>
	</div>
);

// Main Component
export function OrdersTracker() {
	const [transactions, setTransactions] = useState<Transaction[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadFailed, setLoadFailed] = useState(false);
	const [isLiveTracking, setIsLiveTracking] = useState(false);
	const [searchTerm, setSearchTerm] = useState("");
	const [billStatusFilter, setBillStatusFilter] = useState<string>("all");
	const [purposeFilter, setPurposeFilter] = useState<string>("all");
	const [totalCount, setTotalCount] = useState(0);
	const [refreshing, setRefreshing] = useState(false);
	const [filtersOpen, setFiltersOpen] = useState(false);

	const fetchTransactions = useCallback(
		async (showLoading = false) => {
			if (showLoading) {
				setLoading(true);
			}
			setRefreshing(true);

			try {
				const filters: TransactionFilters = {
					search: searchTerm.trim() || undefined,
					billStatus:
						billStatusFilter === "all"
							? undefined
							: (billStatusFilter as "billed" | "not_billed"),
					purposeFilter:
						purposeFilter === "all"
							? undefined
							: (purposeFilter as "personal" | "events"),
					limit: 100,
				};

				const [transactionResult, countResult] = await Promise.all([
					getTransactions(filters),
					getTransactionCount(filters),
				]);

				setLoadFailed(!transactionResult.success);
				if (transactionResult.success) {
					setTransactions(transactionResult.data);
					setTotalCount(
						countResult.success
							? countResult.count
							: transactionResult.data.length,
					);
				} else {
					toast.error(
						transactionResult.error || "Fehler beim Abrufen der Transaktionen",
					);
				}
			} catch (error) {
				console.error("Error fetching transactions:", error);
				setLoadFailed(true);
				toast.error(
					"Ein unerwarteter Fehler ist beim Abrufen der Transaktionen aufgetreten",
				);
			} finally {
				setLoading(false);
				setRefreshing(false);
			}
		},
		[searchTerm, billStatusFilter, purposeFilter],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: mount-only, adding fetchTransactions causes infinite loop
	useEffect(() => {
		fetchTransactions(true);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger deps for debounced re-fetch
	useEffect(() => {
		const timeoutId = setTimeout(() => {
			fetchTransactions(false);
		}, 300);

		return () => clearTimeout(timeoutId);
	}, [searchTerm, billStatusFilter, purposeFilter, fetchTransactions]);

	useEffect(() => {
		if (!isLiveTracking) {
			return;
		}

		const interval = setInterval(() => {
			fetchTransactions(false);
		}, 10000);

		return () => clearInterval(interval);
	}, [isLiveTracking, fetchTransactions]);

	const handleRefresh = () => {
		fetchTransactions(false);
	};

	const hasFilters =
		!!searchTerm || billStatusFilter !== "all" || purposeFilter !== "all";

	if (loading) {
		return (
			<div className="p-4 sm:p-6">
				<div className="mx-auto max-w-7xl">
					<TableSkeleton
						rows={8}
						columns={6}
						label="Transaktionen werden geladen…"
					/>
				</div>
			</div>
		);
	}

	// Nothing to show and the last fetch failed: say so instead of claiming
	// there are no transactions.
	if (loadFailed && transactions.length === 0) {
		return (
			<ErrorState
				title="Transaktionen nicht geladen"
				onRetry={() => void fetchTransactions(true)}
			>
				Die Transaktionen konnten nicht geladen werden. Versuche es noch einmal.
			</ErrorState>
		);
	}

	return (
		<div className="min-h-screen bg-background p-4 sm:p-6">
			<div className="mx-auto max-w-7xl space-y-4 sm:space-y-6">
				{/* Header */}
				<HeaderControls
					totalCount={totalCount}
					refreshing={refreshing}
					isLiveTracking={isLiveTracking}
					onRefresh={handleRefresh}
					onToggleLiveTracking={() => setIsLiveTracking(!isLiveTracking)}
					onOpenFilters={() => setFiltersOpen(true)}
				/>

				{/* Mobile Search Bar */}
				<div className="sm:hidden">
					<SearchBar searchTerm={searchTerm} onSearchChange={setSearchTerm} />
				</div>

				{/* Desktop Filters */}
				<DesktopFilters
					searchTerm={searchTerm}
					billStatusFilter={billStatusFilter}
					purposeFilter={purposeFilter}
					onSearchChange={setSearchTerm}
					onBillStatusChange={setBillStatusFilter}
					onPurposeChange={setPurposeFilter}
				/>

				{/* Mobile Filter Sheet */}
				<MobileFilterSheet
					open={filtersOpen}
					onOpenChange={setFiltersOpen}
					billStatusFilter={billStatusFilter}
					purposeFilter={purposeFilter}
					onBillStatusChange={setBillStatusFilter}
					onPurposeChange={setPurposeFilter}
				/>

				{/* Transactions: one list, table from md up and cards below */}
				<TransactionList transactions={transactions} hasFilters={hasFilters} />
			</div>
		</div>
	);
}
