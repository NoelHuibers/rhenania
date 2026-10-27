"use client";

import {
	Filter,
	Pause,
	Play,
	ReceiptText,
	RefreshCw,
	Search,
	SearchX,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DataList, type DataListColumn } from "~/components/ui/data-list";
import { EmptyState } from "~/components/ui/empty-state";
import { ErrorState } from "~/components/ui/error-state";
import { IconButton } from "~/components/ui/icon-button";
import { Input } from "~/components/ui/input";
import { TableSkeleton } from "~/components/ui/page-skeleton";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "~/components/ui/sheet";
import { formatDate, formatEUR, formatTime } from "~/lib/format";
import {
	getTransactionCount,
	getTransactions,
	type TransactionFilters,
} from "~/server/actions/transactions/tracking";

interface Transaction {
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

// Component: Search Bar
interface SearchBarProps {
	searchTerm: string;
	onSearchChange: (value: string) => void;
}

const SearchBar = ({ searchTerm, onSearchChange }: SearchBarProps) => (
	<div className="relative min-w-0 flex-1">
		<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
		<Input
			placeholder="Suche nach Käufer, Getränk oder Zweck..."
			value={searchTerm}
			onChange={(e) => onSearchChange(e.target.value)}
			className="pl-10"
		/>
	</div>
);

// Component: Filter Buttons
interface FilterButtonsProps {
	billStatusFilter: string;
	purposeFilter: string;
	onBillStatusChange: (value: string) => void;
	onPurposeChange: (value: string) => void;
	isMobile?: boolean;
}

const FilterButtons = ({
	billStatusFilter,
	purposeFilter,
	onBillStatusChange,
	onPurposeChange,
	isMobile = false,
}: FilterButtonsProps) => (
	<>
		<div className={isMobile ? "space-y-2" : "flex flex-col gap-2"}>
			<span className="whitespace-nowrap font-medium text-sm">
				Rechnungsstatus:
			</span>
			<div className="flex gap-2">
				<Button
					variant={billStatusFilter === "all" ? "default" : "outline"}
					size="sm"
					onClick={() => onBillStatusChange("all")}
					className={isMobile ? "flex-1" : ""}
				>
					Alle
				</Button>
				<Button
					variant={billStatusFilter === "billed" ? "default" : "outline"}
					size="sm"
					onClick={() => onBillStatusChange("billed")}
					className={isMobile ? "flex-1" : ""}
				>
					Abgerechnet
				</Button>
				<Button
					variant={billStatusFilter === "not_billed" ? "default" : "outline"}
					size="sm"
					onClick={() => onBillStatusChange("not_billed")}
					className={isMobile ? "flex-1" : ""}
				>
					Offen
				</Button>
			</div>
		</div>

		<div className={isMobile ? "space-y-2" : "flex flex-col gap-2"}>
			<span className="whitespace-nowrap font-medium text-sm">Zweck:</span>
			<div className="flex gap-2">
				<Button
					variant={purposeFilter === "all" ? "default" : "outline"}
					size="sm"
					onClick={() => onPurposeChange("all")}
					className={isMobile ? "flex-1" : ""}
				>
					Alle
				</Button>
				<Button
					variant={purposeFilter === "personal" ? "default" : "outline"}
					size="sm"
					onClick={() => onPurposeChange("personal")}
					className={isMobile ? "flex-1" : ""}
				>
					Persönlich
				</Button>
				<Button
					variant={purposeFilter === "events" ? "default" : "outline"}
					size="sm"
					onClick={() => onPurposeChange("events")}
					className={isMobile ? "flex-1" : ""}
				>
					Veranstaltungen
				</Button>
			</div>
		</div>
	</>
);

// Component: Desktop Filters Card
interface DesktopFiltersProps {
	searchTerm: string;
	billStatusFilter: string;
	purposeFilter: string;
	onSearchChange: (value: string) => void;
	onBillStatusChange: (value: string) => void;
	onPurposeChange: (value: string) => void;
}

const DesktopFilters = ({
	searchTerm,
	billStatusFilter,
	purposeFilter,
	onSearchChange,
	onBillStatusChange,
	onPurposeChange,
}: DesktopFiltersProps) => (
	<Card className="hidden sm:block">
		<CardHeader>
			<CardTitle className="flex items-center gap-2">
				<Filter className="h-5 w-5" />
				Filter & Suche
			</CardTitle>
		</CardHeader>
		<CardContent>
			<div className="flex flex-col items-start gap-4 lg:flex-row lg:items-end">
				<SearchBar searchTerm={searchTerm} onSearchChange={onSearchChange} />
				<FilterButtons
					billStatusFilter={billStatusFilter}
					purposeFilter={purposeFilter}
					onBillStatusChange={onBillStatusChange}
					onPurposeChange={onPurposeChange}
				/>
			</div>
		</CardContent>
	</Card>
);

// Component: Mobile Filter Sheet
interface MobileFilterSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	billStatusFilter: string;
	purposeFilter: string;
	onBillStatusChange: (value: string) => void;
	onPurposeChange: (value: string) => void;
}

const MobileFilterSheet = ({
	open,
	onOpenChange,
	billStatusFilter,
	purposeFilter,
	onBillStatusChange,
	onPurposeChange,
}: MobileFilterSheetProps) => (
	<Sheet open={open} onOpenChange={onOpenChange}>
		<SheetTrigger asChild>
			<span />
		</SheetTrigger>
		<SheetContent side="bottom" className="h-[400px]">
			<SheetHeader>
				<SheetTitle>Filter</SheetTitle>
			</SheetHeader>
			<div className="space-y-4 px-4">
				<FilterButtons
					billStatusFilter={billStatusFilter}
					purposeFilter={purposeFilter}
					onBillStatusChange={onBillStatusChange}
					onPurposeChange={onPurposeChange}
					isMobile={true}
				/>
				<Button onClick={() => onOpenChange(false)} className="w-full">
					Filter anwenden
				</Button>
			</div>
		</SheetContent>
	</Sheet>
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

const TransactionList = ({
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
